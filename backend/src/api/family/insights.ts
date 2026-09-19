import { GetExecutionHistoryCommand, type HistoryEvent as SfnHistoryEvent } from "@aws-sdk/client-sfn";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { authorize } from "../../authz/avp.js";
import { doseEntity, familyEntity, parentEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb, logger, sfn } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { HttpError, json, pathParam, principalFrom } from "../../lib/http.js";
import { getDose, getParent, listRealDoses, listMembers } from "../../lib/repository.js";
import { queryParam } from "../../lib/router.js";
import { buildDoctorReport } from "../../report/build.js";
import { istDate } from "../../scheduling/plan.js";
import { listChecks, listMedicines } from "../../scheduling/sync-slots.js";
import { buildInsights } from "../../views/insights.js";
import { buildReadingSeries } from "../../views/readings.js";
import { buildTimeline, type DoseEventRow, type HistoryEvent } from "../../views/timeline.js";
import { listReadings } from "./checks.js";

async function executionHistory(executionArn: string): Promise<HistoryEvent[]> {
  const events: HistoryEvent[] = [];
  let nextToken: string | undefined;
  try {
    // Two pages cover even a long escalation (a full ladder is well under 200 events).
    for (let page = 0; page < 2; page++) {
      const result = await sfn.send(new GetExecutionHistoryCommand({ executionArn, maxResults: 200, includeExecutionData: false, nextToken }));
      events.push(
        ...(result.events ?? []).map((e: SfnHistoryEvent) => ({
          type: e.type ?? "",
          timestamp: (e.timestamp ?? new Date()).toISOString(),
          stateName: e.stateEnteredEventDetails?.name,
        })),
      );
      nextToken = result.nextToken;
      if (!nextToken) break;
    }
  } catch (error) {
    // The app's own event log still tells most of the story if history is unavailable.
    logger.warn("Could not read execution history", { error: (error as Error).message });
  }
  return events;
}

/** GET /doses/{doseId}/timeline and GET /demo/doses/{doseId}/timeline — "Why am I seeing this?" */
export async function getTimeline(event: APIGatewayProxyEventV2) {
  const doseId = pathParam(event, "doseId");
  const dose = await getDose(doseId);
  if (!dose) throw new HttpError(404, "Dose not found");
  const { entity } = await memberPrincipal(await principalFrom(event), queryParam(event, "asMemberId"));
  await authorize({ principal: entity, action: "ViewTimeline", resource: doseEntity(dose), entities: [familyEntity(dose.fid)] });

  const [eventsResult, history, members, parent] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :evt)",
        ExpressionAttributeValues: { ":pk": `DOSE#${doseId}`, ":evt": "EVT#" },
      }),
    ),
    executionHistory(dose.executionArn),
    listMembers(dose.fid),
    getParent(dose.fid, dose.pid),
  ]);

  const items = buildTimeline(
    (eventsResult.Items ?? []) as DoseEventRow[],
    history,
    new Map(members.map((m) => [m.mid, m.displayName])),
    parent?.displayName ?? "",
  );
  return json(200, {
    doseId,
    parentName: parent?.displayName ?? "",
    slotName: dose.slotName,
    scheduledAt: dose.scheduledAt,
    status: dose.status,
    missClass: dose.missClass ?? null,
    critical: dose.critical,
    items,
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 3600 * 1000;

/** GET /families/{fid}/parents/{pid}/report?from=yyyy-MM-dd&to=yyyy-MM-dd — for the doctor visit. */
export async function getReport(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const pid = pathParam(event, "pid");
  const parent = await getParent(fid, pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  const { entity } = await memberPrincipal(await principalFrom(event), queryParam(event, "asMemberId"));
  await authorize({ principal: entity, action: "ViewReport", resource: parentEntity(parent), entities: [familyEntity(fid)] });

  const to = queryParam(event, "to") ?? istDate();
  const from = queryParam(event, "from") ?? istDate(new Date(Date.parse(`${to}T12:00:00+05:30`) - 6 * DAY_MS));
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new HttpError(400, "Use from ≤ to, as yyyy-MM-dd");
  const spanDays = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (spanDays > 31) throw new HttpError(400, "A report can cover at most 31 days");

  const [doses, medicines, members, checks, readings] = await Promise.all([
    listRealDoses(pid, `${from.replaceAll("-", "")}0000`, `${to.replaceAll("-", "")}2359`),
    listMedicines(pid),
    listMembers(fid),
    listChecks(pid),
    // A day either side, because the sort key is a UTC instant while from/to are Indian dates:
    // a 6 a.m. IST reading carries the previous UTC date. buildReadingSeries filters by IST date.
    listReadings(pid, `${istDate(new Date(Date.parse(`${from}T12:00:00+05:30`) - DAY_MS))}T00:00:00.000Z`, `${istDate(new Date(Date.parse(`${to}T12:00:00+05:30`) + DAY_MS))}T23:59:59.999Z`),
  ]);
  const names = new Map(members.map((m) => [m.mid, m.displayName]));
  // Test and demo runs are not part of the medical record.
  const real = doses.filter((d) => d.SK.split("#").length === 2);
  const report = buildDoctorReport(
    medicines.map((m) => ({ medId: m.medId, nameAsPrinted: m.nameAsPrinted, strength: m.strength })),
    real.map((d) => ({
      doseId: d.doseId,
      doseStamp: d.SK.slice("DOSE#".length),
      medIds: d.medIds,
      status: d.status,
      missClass: d.missClass ?? null,
      claimedByName: d.claimedBy ? (names.get(d.claimedBy) ?? null) : null,
    })),
  );

  return json(200, {
    parent: { displayName: parent.displayName },
    from,
    to,
    generatedAt: new Date().toISOString(),
    medicines: medicines
      .filter((m) => report.rows.some((r) => r.medId === m.medId))
      .map((m) => ({ medId: m.medId, nameAsPrinted: m.nameAsPrinted, strength: m.strength, slots: m.slots, food: m.food, active: m.active })),
    report,
    // Stopped checks stay in, so a period that included them is not silently missing its readings.
    readings: buildReadingSeries({
      readings,
      checks: checks.map((c) => ({ checkId: c.checkId, type: c.type, slots: c.slots, weekdays: c.weekdays, escalates: c.escalates, active: c.active, endDate: c.endDate })),
      from,
      to,
    }),
  });
}

/**
 * GET /families/{fid}/parents/{pid}/insights?days=7|30 — the analytics dashboard.
 * Reads twice the period so trends can be compared with the period before.
 */
export async function getInsights(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const pid = pathParam(event, "pid");
  const parent = await getParent(fid, pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  const { entity } = await memberPrincipal(await principalFrom(event), queryParam(event, "asMemberId"));
  await authorize({ principal: entity, action: "ViewReport", resource: parentEntity(parent), entities: [familyEntity(fid)] });

  const days = queryParam(event, "days") === "7" ? 7 : 30;
  // Today's doses may still be open, so the period ends yesterday.
  const to = istDate(new Date(Date.now() - DAY_MS));
  const toMs = Date.parse(`${to}T12:00:00+05:30`);
  const from = istDate(new Date(toMs - (days - 1) * DAY_MS));
  const previousFrom = istDate(new Date(toMs - (2 * days - 1) * DAY_MS));
  const stamp = (date: string, time: string) => `${date.replaceAll("-", "")}${time}`;

  const [doses, medicines, members, checks, readings] = await Promise.all([
    listRealDoses(pid, stamp(previousFrom, "0000"), stamp(to, "2359")),
    listMedicines(pid),
    listMembers(fid),
    listChecks(pid),
    // A day either side: the sort key is a UTC instant, the period is in Indian dates.
    listReadings(pid, `${istDate(new Date(Date.parse(`${from}T12:00:00+05:30`) - DAY_MS))}T00:00:00.000Z`, `${istDate(new Date(toMs + DAY_MS))}T23:59:59.999Z`),
  ]);
  // Test and demo runs are not part of the record.
  const real = doses.filter((d) => d.SK.split("#").length === 2);
  const current = real.filter((d) => istDate(new Date(d.scheduledAt)) >= from);
  const previous = real.filter((d) => istDate(new Date(d.scheduledAt)) < from);
  const names = new Map(members.map((m) => [m.mid, m.displayName]));

  return json(200, {
    ...buildInsights({
      doses: current,
      previousDoses: previous,
      medicines,
      ladder: parent.ladder.map((mid) => ({ mid, displayName: names.get(mid) ?? "" })),
      to,
      days,
    }),
    readings: buildReadingSeries({
      readings,
      checks: checks
        .filter((c) => c.active)
        .map((c) => ({ checkId: c.checkId, type: c.type, slots: c.slots, weekdays: c.weekdays, escalates: c.escalates, active: c.active, endDate: c.endDate })),
      from,
      to,
    }),
  });
}
