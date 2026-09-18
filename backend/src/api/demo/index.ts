import { DescribeExecutionCommand, StartExecutionCommand, StopExecutionCommand } from "@aws-sdk/client-sfn";
import { BatchWriteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { istDoseStamp, keys, makeDoseId } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildDemoSeed, DEMO_PEOPLE } from "../../demo/fixtures.js";
import { samplePrescription } from "../../demo/sample-prescription.js";
import { ddb, logger, metrics, secret, sfn, ttlInHours } from "../../lib/aws.js";
import { signDemoToken } from "../../lib/demo-jwt.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, principalFrom } from "../../lib/http.js";
import { newId } from "../../lib/ids.js";
import type { DoseItem } from "../../lib/model.js";
import { takeFromBudget } from "../../lib/rate-limit.js";
import { get, getParent, listDoses, listMembers } from "../../lib/repository.js";
import { router } from "../../lib/router.js";
import { istDate } from "../../scheduling/plan.js";
import { openAlerts } from "../../views/dashboard.js";
import { getInsights, getReport, getTimeline } from "../family/insights.js";
import { doseView } from "../parent/index.js";

// Built once: a formatter per call holds native ICU memory that V8 will not collect in time.
const IST_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" });

const SESSION_HOURS = 2;
const MAX_RUNS_PER_SESSION = 20;
const MAX_SESSIONS_PER_DAY = 300;
/**
 * Per caller, not per person: judges at one venue share a NAT address, and at ten the eleventh
 * person to open the demo would have been locked out by the first ten. Forty keeps a shared network
 * working while a single abuser still cannot get far — each session is capped at 20 doses, expires
 * after two hours, and the daily total above is the real ceiling.
 */
const MAX_SESSIONS_PER_IP_PER_DAY = 40;

interface DemoSession {
  PK: string;
  SK: string;
  sid: string;
  fid: string;
  pid: string;
  sonId: string;
  daughterId: string;
  runs: number;
  lastExecutionArn?: string;
  lastDoseId?: string;
  ttl: number;
}

async function demoEnabled(): Promise<boolean> {
  try {
    return (await secret("demo-enabled")).trim().toLowerCase() !== "false";
  } catch {
    return true; // No kill-switch parameter means the demo is on.
  }
}

/** POST /demo/sessions (public) — a fresh fictional family that expires by itself. */
async function createSession(event: APIGatewayProxyEventV2) {
  if (!(await demoEnabled())) throw new HttpError(503, "The live demo is paused. Please watch the video instead.");
  const day = istDate();
  if (!(await takeFromBudget(`demo-sessions#${day}`, MAX_SESSIONS_PER_DAY, 86_400))) {
    throw new HttpError(503, "The live demo is busy today. Please watch the video instead.");
  }
  const ipHash = createHash("sha256").update(`${event.requestContext.http.sourceIp}|${day}`).digest("hex").slice(0, 16);
  if (!(await takeFromBudget(`demo-ip#${ipHash}#${day}`, MAX_SESSIONS_PER_IP_PER_DAY, 86_400))) {
    throw new HttpError(429, "You have started many demos today. Please reuse the one you have.");
  }

  const sid = newId("s");
  const ttl = ttlInHours(SESSION_HOURS);
  const seed = buildDemoSeed({ sid, now: Date.now(), ttl });
  const session: DemoSession = { ...keys.demoSession(sid), sid, fid: seed.fid, pid: seed.pid, sonId: seed.sonId, daughterId: seed.daughterId, runs: 0, ttl };

  const items = [session as unknown as Record<string, unknown>, ...seed.items];
  for (let i = 0; i < items.length; i += 25) {
    await ddb.send(new BatchWriteCommand({ RequestItems: { [env.tableName]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) } }));
  }

  const token = signDemoToken(await secret("demo-jwt-secret"), { kind: "demo", sid, fid: seed.fid, gen: 1, exp: ttl });
  metrics.addMetric("DemoSessions", "Count", 1);
  metrics.publishStoredMetrics();
  return json(201, {
    token,
    expiresAt: new Date(ttl * 1000).toISOString(),
    fid: seed.fid,
    parent: { pid: seed.pid, ...DEMO_PEOPLE.parent },
    members: [
      { mid: seed.sonId, role: "owner", ...DEMO_PEOPLE.son },
      { mid: seed.daughterId, role: "member", ...DEMO_PEOPLE.daughter },
    ],
  });
}

async function sessionFor(event: APIGatewayProxyEventV2): Promise<DemoSession> {
  const principal = await principalFrom(event);
  if (principal.kind !== "demo") throw new HttpError(403, "Demo sessions only");
  const session = await get<DemoSession>(keys.demoSession(principal.sid), true);
  if (!session || session.fid !== principal.fid) throw new HttpError(410, "This demo has expired. Start a new one.");
  return session;
}

async function executionStatus(arn?: string): Promise<string | null> {
  if (!arn) return null;
  const result = await sfn.send(new DescribeExecutionCommand({ executionArn: arn }));
  return result.status ?? null;
}

const StartDoseSchema = z.object({ critical: z.boolean().default(false) });

/** POST /demo/doses — start a real escalation workflow at 60× speed (20 minutes become 20 seconds). */
async function startDose(event: APIGatewayProxyEventV2) {
  const session = await sessionFor(event);
  const { critical } = parseBody(event, StartDoseSchema);
  if ((await executionStatus(session.lastExecutionArn)) === "RUNNING") {
    throw new HttpError(409, "A dose is still in progress. Finish it or reset the demo.");
  }

  const scheduledTime = new Date().toISOString();
  let runs: number;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys.demoSession(session.sid),
        UpdateExpression: "SET runs = runs + :one",
        ConditionExpression: "runs < :max",
        ExpressionAttributeValues: { ":one": 1, ":max": MAX_RUNS_PER_SESSION },
        ReturnValues: "ALL_NEW",
      }),
    );
    runs = (result.Attributes as DemoSession).runs;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") throw new HttpError(429, "This demo has run many doses. Start a fresh one.");
    throw error;
  }

  // Use whichever of the fictional family's two slots fits the current time in India, so the
  // reminder's time of day matches the clock on the judge's screen. The night slot includes insulin,
  // which is the critical medicine.
  const istHour = Number(IST_HOUR.format(new Date()));
  const slot = critical || istHour >= 15 || istHour < 4 ? "2100" : "0800";
  const doseId = makeDoseId(session.pid, istDoseStamp(new Date(scheduledTime)), runs);
  const execution = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: env.stateMachineArn,
      input: JSON.stringify({ fid: session.fid, pid: session.pid, slot, mode: "demo", speed: 60, critical, demoRun: runs, scheduledTime }),
    }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys.demoSession(session.sid),
      UpdateExpression: "SET lastExecutionArn = :arn, lastDoseId = :doseId",
      ExpressionAttributeValues: { ":arn": execution.executionArn, ":doseId": doseId },
    }),
  );
  metrics.addMetric("DemoRuns", "Count", 1);
  metrics.publishStoredMetrics();
  return json(202, { doseId, executionArn: execution.executionArn });
}

/** GET /demo/state — one poll feeds both phone panes and the timeline drawer. */
async function getState(event: APIGatewayProxyEventV2) {
  const session = await sessionFor(event);
  const today = istDate().replaceAll("-", "");
  const [parent, members, doses, inbox, status] = await Promise.all([
    getParent(session.fid, session.pid),
    listMembers(session.fid),
    listDoses(session.pid, `${today}0000`, `${today}2359`),
    ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :inbox)",
        ExpressionAttributeValues: { ":pk": `FAM#${session.fid}`, ":inbox": "INBOX#" },
      }),
    ),
    executionStatus(session.lastExecutionArn),
  ]);
  const current = session.lastDoseId ? doses.find((d) => d.doseId === session.lastDoseId) : undefined;
  const memberNames = new Map(members.map((m) => [m.mid, m.displayName]));

  const byRecipient: Record<string, unknown[]> = {};
  for (const item of (inbox.Items ?? []) as ({ SK: string; ttl?: number } & Record<string, unknown>)[]) {
    if (item.ttl && item.ttl * 1000 < Date.now()) continue;
    const recipient = item.SK.split("#")[1] ?? "";
    (byRecipient[recipient] ??= []).push({ title: item.t, body: item.b, lang: item.l, doseId: item.doseId, step: item.step, url: item.url, sig: item.sig, at: item.at });
  }

  return json(200, {
    executionStatus: status,
    runsLeft: MAX_RUNS_PER_SESSION - session.runs,
    parent: parent ? { pid: parent.pid, displayName: parent.displayName, lang: parent.lang, lastReceiptAt: parent.lastReceiptAt ?? null } : null,
    members: members.map((m) => ({ mid: m.mid, displayName: m.displayName, relation: m.relation ?? null, lang: m.lang, role: m.role, position: parent?.ladder.indexOf(m.mid) ?? -1 })),
    currentDose: current ? { ...(await doseView(current)), missClass: current.missClass ?? null, claimedBy: current.claimedBy ?? null, claimedByName: current.claimedBy ? (memberNames.get(current.claimedBy) ?? null) : null } : null,
    inbox: byRecipient,
    openAlertsByMember: Object.fromEntries(
      members.map((m) => [m.mid, openAlerts(doses as DoseItem[], m.mid, new Map([[session.pid, parent?.displayName ?? ""]]), memberNames)]),
    ),
  });
}

/** POST /demo/reset — stop the running escalation; the page then starts a fresh session. */
async function reset(event: APIGatewayProxyEventV2) {
  const session = await sessionFor(event);
  if ((await executionStatus(session.lastExecutionArn)) === "RUNNING") {
    await sfn.send(new StopExecutionCommand({ executionArn: session.lastExecutionArn, cause: "Demo reset" }));
    logger.info("Demo execution stopped", { sid: session.sid });
  }
  await ddb.send(new UpdateCommand({ TableName: env.tableName, Key: keys.demoSession(session.sid), UpdateExpression: "SET #ttl = :now", ExpressionAttributeNames: { "#ttl": "ttl" }, ExpressionAttributeValues: { ":now": Math.floor(Date.now() / 1000) } }));
  return json(204);
}

/** GET /demo/prescription — a fictional printed prescription, already read, for the review screen. */
async function getSamplePrescription(event: APIGatewayProxyEventV2) {
  await sessionFor(event);
  return json(200, { sample: true, status: "READY", guardrailInterventions: 0, ...samplePrescription() });
}

export const DEMO_ROUTES = {
  "POST /demo/sessions": createSession,
  "GET /demo/state": getState,
  "POST /demo/doses": startDose,
  "POST /demo/reset": reset,
  "GET /demo/prescription": getSamplePrescription,
  "GET /demo/doses/{doseId}/timeline": getTimeline,
  "GET /demo/families/{fid}/parents/{pid}/report": getReport,
  "GET /demo/families/{fid}/parents/{pid}/insights": getInsights,
} as const;

export const handler = router(DEMO_ROUTES);
