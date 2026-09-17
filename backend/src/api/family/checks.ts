import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CHECK_DEFINITIONS, checkDefinition, formatReading, keys, roundReading, validateReading, type CheckType } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { authorize } from "../../authz/avp.js";
import { familyEntity, parentEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb, isExpired, ttlInDays } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, pathParam, principalFrom } from "../../lib/http.js";
import { newId } from "../../lib/ids.js";
import type { CheckItem, ReadingItem } from "../../lib/model.js";
import { get, getParent } from "../../lib/repository.js";
import { CheckFields, CheckInputSchema, ReadingInputSchema } from "../../lib/schemas.js";
import { listChecks, syncSlots } from "../../scheduling/sync-slots.js";

/**
 * Daily checks (blood sugar, blood pressure, weight, oxygen, temperature) and the readings recorded
 * against them. DoseCircle stores numbers and never interprets them: nothing here decides whether a
 * reading is good or bad, and no reading ever triggers an alert on its own.
 */

async function authorizedParent(event: APIGatewayProxyEventV2, action: "ManageChecks" | "ViewReadings" | "RecordReading") {
  const fid = pathParam(event, "fid");
  const pid = pathParam(event, "pid");
  const parent = await getParent(fid, pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  const { entity, member } = await memberPrincipal(await principalFrom(event), event.queryStringParameters?.asMemberId);
  await authorize({ principal: entity, action, resource: parentEntity(parent), entities: [familyEntity(fid)] });
  return { fid, pid, parent, mid: member.mid };
}

function toView(check: CheckItem) {
  return {
    checkId: check.checkId,
    type: check.type,
    slots: check.slots,
    weekdays: check.weekdays ?? [],
    escalates: check.escalates,
    endDate: check.endDate ?? null,
    active: check.active,
    fields: checkDefinition(check.type).fields,
    chart: checkDefinition(check.type).chart,
  };
}

function readingView(reading: ReadingItem) {
  return {
    checkId: reading.checkId,
    type: reading.type,
    values: reading.values,
    at: reading.at,
    text: formatReading(reading.type, reading.values),
    recordedBy: reading.recordedBy,
    doseId: reading.doseId ?? null,
  };
}

/** GET /families/{fid}/parents/{pid}/checks — what is scheduled, plus the shape of every check type. */
export async function listParentChecks(event: APIGatewayProxyEventV2) {
  const { pid } = await authorizedParent(event, "ManageChecks");
  const checks = await listChecks(pid);
  return json(200, {
    checks: checks.filter((c) => c.active).map(toView),
    types: Object.values(CHECK_DEFINITIONS),
  });
}

/** POST /families/{fid}/parents/{pid}/checks — schedule a daily check. */
export async function addCheck(event: APIGatewayProxyEventV2) {
  const { fid, pid, mid } = await authorizedParent(event, "ManageChecks");
  const input = parseBody(event, CheckInputSchema);
  const existing = await listChecks(pid);
  if (existing.some((c) => c.active && c.type === input.type)) {
    throw new HttpError(409, "That check is already scheduled. Change the existing one instead.");
  }

  const checkId = newId("chk");
  const item: CheckItem = {
    ...keys.check(pid, checkId),
    pid,
    checkId,
    type: input.type,
    slots: input.slots,
    weekdays: input.weekdays,
    escalates: input.escalates ?? checkDefinition(input.type).escalatesByDefault,
    active: true,
    endDate: input.endDate ?? undefined,
    createdAt: new Date().toISOString(),
    createdBy: mid,
  };
  await ddb.send(new PutCommand({ TableName: env.tableName, Item: item }));
  await syncSlots(fid, pid);
  return json(201, { check: toView(item) });
}

const CheckPatchSchema = CheckFields.omit({ type: true })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

/** PATCH /families/{fid}/parents/{pid}/checks/{checkId} — times of day, days of the week, escalation, end date. */
export async function updateCheck(event: APIGatewayProxyEventV2) {
  const { fid, pid } = await authorizedParent(event, "ManageChecks");
  const checkId = pathParam(event, "checkId");
  const current = await get<CheckItem>(keys.check(pid, checkId));
  if (!current || !current.active) throw new HttpError(404, "Check not found");

  const patch = parseBody(event, CheckPatchSchema);
  // Validate the check as it will be after the change, not just the patch.
  const merged = CheckInputSchema.safeParse({ ...toView(current), ...patch, type: current.type });
  if (!merged.success) throw new HttpError(400, merged.error.issues[0]?.message ?? "Invalid check");

  const next: CheckItem = {
    ...current,
    slots: merged.data.slots,
    weekdays: merged.data.weekdays,
    escalates: merged.data.escalates ?? current.escalates,
    endDate: merged.data.endDate ?? undefined,
  };
  await ddb.send(new PutCommand({ TableName: env.tableName, Item: next }));
  await syncSlots(fid, pid);
  return json(200, { check: toView(next) });
}

/** DELETE /families/{fid}/parents/{pid}/checks/{checkId} — stopped checks keep their readings for the report. */
export async function stopCheck(event: APIGatewayProxyEventV2) {
  const { fid, pid } = await authorizedParent(event, "ManageChecks");
  const checkId = pathParam(event, "checkId");
  await ddb
    .send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys.check(pid, checkId),
        UpdateExpression: "SET active = :false, stoppedAt = :now",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: { ":false": false, ":now": new Date().toISOString() },
      }),
    )
    .catch((error: { name?: string }) => {
      if (error.name === "ConditionalCheckFailedException") throw new HttpError(404, "Check not found");
      throw error;
    });
  await syncSlots(fid, pid);
  return json(200, { checkId, active: false });
}

/** Readings for a parent between two ISO instants, oldest first. */
export async function listReadings(pid: string, fromIso: string, toIso: string): Promise<ReadingItem[]> {
  const items: ReadingItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        // "~" sorts after every character used in a check id, so the upper bound is inclusive.
        ExpressionAttributeValues: { ":pk": `PARENT#${pid}`, ":from": `READING#${fromIso}`, ":to": `READING#${toIso}~` },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as ReadingItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items.filter((r) => !isExpired(r));
}

const RangeSchema = z.object({ days: z.coerce.number().int().min(1).max(120).default(30) });

/** GET /families/{fid}/parents/{pid}/readings?days=30 */
export async function getReadings(event: APIGatewayProxyEventV2) {
  const { pid } = await authorizedParent(event, "ViewReadings");
  const { days } = RangeSchema.parse(event.queryStringParameters ?? {});
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const [readings, checks] = await Promise.all([listReadings(pid, from.toISOString(), to.toISOString()), listChecks(pid)]);
  return json(200, {
    from: from.toISOString(),
    to: to.toISOString(),
    checks: checks.map(toView),
    readings: readings.map(readingView),
  });
}

/**
 * Stores one reading. Shared by the family route and the parent's own phone, so both paths validate
 * against the same limits and round to the same decimals.
 */
export async function recordReading(args: {
  pid: string;
  checkId: string;
  values: Record<string, number>;
  at?: string;
  doseId?: string;
  recordedBy: ReadingItem["recordedBy"];
  demo?: boolean;
}): Promise<ReadingItem> {
  const check = await get<CheckItem>(keys.check(args.pid, args.checkId));
  if (!check) throw new HttpError(404, "Check not found");

  const at = args.at ?? new Date().toISOString();
  const now = Date.now();
  const when = new Date(at).getTime();
  if (Number.isNaN(when)) throw new HttpError(400, "That is not a valid time");
  // A reading is recorded as it is taken. Backdating further than a day would quietly rewrite history.
  if (when > now + 120_000) throw new HttpError(400, "A reading cannot be in the future");
  if (when < now - 86_400_000) throw new HttpError(400, "A reading can only be recorded for the last 24 hours");

  const problems = validateReading(check.type, args.values);
  if (problems.length > 0) throw new HttpError(400, readingProblemMessage(check.type, problems));

  const item: ReadingItem = {
    ...keys.reading(args.pid, at, args.checkId),
    pid: args.pid,
    checkId: args.checkId,
    type: check.type,
    values: roundReading(check.type, args.values),
    at,
    doseId: args.doseId,
    recordedBy: args.recordedBy,
    ttl: args.demo ? ttlInDays(1) : ttlInDays(400),
  };
  await ddb.send(new PutCommand({ TableName: env.tableName, Item: item }));
  return item;
}

function readingProblemMessage(type: CheckType, problems: ReturnType<typeof validateReading>): string {
  const first = problems[0]!;
  const field = checkDefinition(type).fields.find((f) => f.key === first.field);
  if (first.reason === "missing") return `${first.field} is needed`;
  if (first.reason === "unknown_field") return `${first.field} is not part of this check`;
  return field ? `${first.field} must be between ${field.min} and ${field.max} ${field.unit}` : `${first.field} is out of range`;
}

/** POST /families/{fid}/parents/{pid}/readings — a family member enters a reading on the parent's behalf. */
export async function addReading(event: APIGatewayProxyEventV2) {
  const { pid, mid } = await authorizedParent(event, "RecordReading");
  const input = parseBody(event, ReadingInputSchema);
  const reading = await recordReading({
    pid,
    checkId: input.checkId,
    values: input.values,
    at: input.at,
    doseId: input.doseId,
    recordedBy: { kind: "member", id: mid },
  });
  return json(201, { reading: readingView(reading) });
}

/** DELETE /families/{fid}/parents/{pid}/readings/{at}/{checkId} — a mistyped reading can be taken back out. */
export async function deleteReading(event: APIGatewayProxyEventV2) {
  const { pid } = await authorizedParent(event, "RecordReading");
  const at = decodeURIComponent(pathParam(event, "at"));
  const checkId = pathParam(event, "checkId");
  await ddb
    .send(
      new DeleteCommand({ TableName: env.tableName, Key: keys.reading(pid, at, checkId), ConditionExpression: "attribute_exists(PK)" }),
    )
    .catch((error: { name?: string }) => {
      if (error.name === "ConditionalCheckFailedException") throw new HttpError(404, "Reading not found");
      throw error;
    });
  return json(200, { deleted: true });
}
