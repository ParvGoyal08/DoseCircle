import { PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { checkDefinition, formatReading, isCheckDueAt, keys, voicePhrasePath, type LanguageCode, type SlotName } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { authorize } from "../../authz/avp.js";
import { doseEntity, familyEntity, parentEntity } from "../../authz/entities.js";
import { devicePrincipal } from "../../authz/principal-entity.js";
import { ddb, metrics } from "../../lib/aws.js";
import { newDeviceToken, normaliseInviteCode, sha256Hex } from "../../lib/crypto.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, pathParam, principalFrom } from "../../lib/http.js";
import { newId } from "../../lib/ids.js";
import type { CheckItem, DeviceItem, DoseItem, InviteItem, MedicineItem, ParentItem } from "../../lib/model.js";
import { PushSubscriptionSchema } from "../../lib/push-endpoints.js";
import { takeFromBudget } from "../../lib/rate-limit.js";
import { get, getDose, getParent, listDoses } from "../../lib/repository.js";
import { router } from "../../lib/router.js";
import { DisplayNameSchema, LanguageSchema, ReadingInputSchema } from "../../lib/schemas.js";
import { istDate, istWeekday } from "../../scheduling/plan.js";
import { listChecks, listMedicines, listSlots } from "../../scheduling/sync-slots.js";
import { listReadings, recordReading } from "../family/checks.js";
import { startPrescription } from "../family/prescriptions.js";

const PairSchema = z.object({ code: z.string().min(6).max(20) });

/** Wrong codes allowed per caller per hour before pairing is refused. */
const MAX_PAIR_FAILURES_PER_HOUR = 8;

/**
 * POST /parent/pair (public) — the parent's phone exchanges a one-time code for a long-lived device
 * token. Elderly parents never create a password. Only hashes of the code and token are stored.
 */
async function pair(event: APIGatewayProxyEventV2) {
  const { code } = parseBody(event, PairSchema);
  // A wrong code can't be tied to any one invite, so guessing is limited per caller: a handful of
  // failures an hour, on top of the route's own throttle and the code's 48-hour life.
  const caller = sha256Hex(`${event.requestContext.http.sourceIp}|${new Date().toISOString().slice(0, 13)}`).slice(0, 16);
  const failureBudget = `pair-fail#${caller}`;
  const tooManyFailures = new HttpError(429, "Too many tries. Please wait a while, then ask your family for a new code.");

  const inviteKey = keys.invite(sha256Hex(normaliseInviteCode(code)));
  const invite = await get<InviteItem>(inviteKey, true);
  const wrongCode = async () => {
    if (!(await takeFromBudget(failureBudget, MAX_PAIR_FAILURES_PER_HOUR, 3600))) throw tooManyFailures;
    return new HttpError(404, "This code is not valid any more. Ask your family for a new one.");
  };
  if (!invite || invite.kind !== "parent" || !invite.pid || invite.consumedAt) throw await wrongCode();
  const parent = await getParent(invite.fid, invite.pid);
  if (!parent) throw await wrongCode();

  const token = newDeviceToken();
  const deviceId = newId("dev");
  const device: DeviceItem = {
    ...keys.device(sha256Hex(token)),
    GSI1PK: `PARENT#${parent.pid}#DEVICES`,
    GSI1SK: `DEVICE#${deviceId}`,
    deviceId,
    fid: parent.fid,
    pid: parent.pid,
    lang: parent.lang,
    revoked: false,
    pairedAt: new Date().toISOString(),
  };
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: inviteKey,
              UpdateExpression: "SET consumedAt = :now, deviceId = :deviceId",
              ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(consumedAt)",
              ExpressionAttributeValues: { ":now": device.pairedAt, ":deviceId": deviceId },
            },
          },
          { Put: { TableName: env.tableName, Item: device, ConditionExpression: "attribute_not_exists(PK)" } },
        ],
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === "TransactionCanceledException") throw new HttpError(409, "This code was already used. Ask your family for a new one.");
    throw error;
  }
  metrics.addMetric("PhonesPaired", "Count", 1);
  metrics.publishStoredMetrics();
  return json(201, { deviceToken: token, parent: { displayName: parent.displayName, lang: parent.lang } });
}

function medicineLine(m: MedicineItem, slotName: SlotName) {
  // Medicine names are shown exactly as printed on the strip — never translated.
  return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, strength: m.strength, count: m.slots[slotName] ?? null, food: m.food, critical: m.critical };
}

/** What the parent's screen needs to ask for one measurement: the boxes to fill, and their limits. */
function checkLine(check: CheckItem) {
  return { checkId: check.checkId, type: check.type, fields: checkDefinition(check.type).fields };
}

async function requireParent(event: APIGatewayProxyEventV2): Promise<{ parent: ParentItem; principal: Awaited<ReturnType<typeof principalFrom>> }> {
  const principal = await principalFrom(event);
  if (principal.kind !== "device") throw new HttpError(403, "Only a paired phone can do this");
  const parent = await getParent(principal.fid, principal.pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  await authorize({ principal: devicePrincipal(principal, parent.pid), action: "ViewParent", resource: parentEntity(parent), entities: [familyEntity(parent.fid)] });
  return { parent, principal };
}

/** GET /parent/today — the parent's calm "today" screen: tablets and measurements, time of day by time of day. */
async function today(event: APIGatewayProxyEventV2) {
  const { parent } = await requireParent(event);
  const todayIst = istDate();
  const date = todayIst.replaceAll("-", "");
  const weekday = istWeekday();
  const [slots, medicines, checks, doses, readings] = await Promise.all([
    listSlots(parent.pid),
    listMedicines(parent.pid),
    listChecks(parent.pid),
    listDoses(parent.pid, `${date}0000`, `${date}2359`),
    // 00:00 IST today is 18:30Z yesterday, so the window starts a day earlier; the readings are
    // then matched to today's doses by doseId rather than by date.
    listReadings(parent.pid, `${istDate(new Date(Date.now() - 86_400_000))}T00:00:00.000Z`, new Date().toISOString()),
  ]);
  const byId = new Map(medicines.map((m) => [m.medId, m]));
  const checkById = new Map(checks.map((c) => [c.checkId, c]));
  const realDoses = doses.filter((d) => d.SK.split("#").length === 2);

  return json(200, {
    parent: { displayName: parent.displayName, lang: parent.lang, paused: parent.paused },
    // "Nothing today" and "your family has not added anything yet" need different words on the
    // parent's screen: the first is normal, the second means the family still has work to do.
    hasSchedule: medicines.some((m) => m.active) || checks.some((c) => c.active),
    slots: slots
      .sort((a, b) => a.compactTime.localeCompare(b.compactTime))
      .map((slot) => {
        const dose = realDoses.find((d) => d.slotName === slot.slotName);
        const dueChecks = (slot.checkIds ?? [])
          .map((id) => checkById.get(id))
          .filter((c): c is CheckItem => Boolean(c) && isCheckDueAt(c!, slot.slotName, todayIst, weekday));
        return {
          slotName: slot.slotName,
          time: `${slot.compactTime.slice(0, 2)}:${slot.compactTime.slice(2)}`,
          medicines: slot.medIds.map((id) => byId.get(id)).filter((m): m is MedicineItem => Boolean(m)).map((m) => medicineLine(m, slot.slotName)),
          checks: dueChecks.map((c) => {
            const recorded = readings.find((r) => r.checkId === c.checkId && (dose ? r.doseId === dose.doseId : false));
            return { ...checkLine(c), recorded: recorded ? { at: recorded.at, values: recorded.values, text: formatReading(c.type, recorded.values) } : null };
          }),
          dose: dose ? { doseId: dose.doseId, status: dose.status } : null,
        };
      }),
  });
}

/** GET /parent/doses/{doseId} — the reminder screen opened from a notification. */
async function doseScreen(event: APIGatewayProxyEventV2) {
  const principal = await principalFrom(event);
  const dose = await getDose(pathParam(event, "doseId"));
  if (!dose) throw new HttpError(404, "Dose not found");
  await authorize({ principal: devicePrincipal(principal, dose.pid), action: "ViewDose", resource: doseEntity(dose), entities: [familyEntity(dose.fid)] });
  return json(200, await doseView(dose));
}

export async function doseView(dose: DoseItem) {
  const [parent, medicines, checks] = await Promise.all([getParent(dose.fid, dose.pid), listMedicines(dose.pid), listChecks(dose.pid)]);
  const lang = (parent?.lang ?? "en") as LanguageCode;
  return {
    doseId: dose.doseId,
    status: dose.status,
    slotName: dose.slotName,
    scheduledAt: dose.scheduledAt,
    critical: dose.critical,
    parent: { displayName: parent?.displayName ?? "", lang },
    medicines: dose.medIds.map((id) => medicines.find((m) => m.medId === id)).filter((m): m is MedicineItem => Boolean(m)).map((m) => medicineLine(m, dose.slotName)),
    checks: (dose.checkIds ?? []).map((id) => checks.find((c) => c.checkId === id)).filter((c): c is CheckItem => Boolean(c)).map(checkLine),
    voice: { src: voicePhrasePath(lang, `remind_${dose.slotName}`), thanks: voicePhrasePath(lang, "taken_thanks") },
  };
}

const SubscriptionBody = z.object({ subscription: PushSubscriptionSchema });

/** POST /parent/push/subscription — the parent's phone can receive reminders. */
async function saveSubscription(event: APIGatewayProxyEventV2) {
  const { parent, principal } = await requireParent(event);
  if (principal.kind !== "device") throw new HttpError(403, "Only a paired phone can do this");
  const { subscription } = parseBody(event, SubscriptionBody);
  await ddb.send(
    new PutCommand({
      TableName: env.tableName,
      Item: { ...keys.pushSubscription(principal.deviceId, sha256Hex(subscription.endpoint)), subjectId: principal.deviceId, subscription, lang: parent.lang, savedAt: new Date().toISOString() },
    }),
  );
  return json(201, { saved: true });
}

const LangBody = z.object({ lang: LanguageSchema });

/** PUT /parent/lang — the parent chooses their own language; reminders follow it. */
async function setLanguage(event: APIGatewayProxyEventV2) {
  const { parent, principal } = await requireParent(event);
  if (principal.kind !== "device") throw new HttpError(403, "Only a paired phone can do this");
  const { lang } = parseBody(event, LangBody);
  const devices = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
      ExpressionAttributeValues: { ":pk": `PARENT#${parent.pid}#DEVICES`, ":sk": `DEVICE#${principal.deviceId}` },
    }),
  );
  const device = devices.Items?.[0] as DeviceItem | undefined;
  await ddb.send(new UpdateCommand({ TableName: env.tableName, Key: { PK: parent.PK, SK: parent.SK }, UpdateExpression: "SET lang = :lang", ExpressionAttributeValues: { ":lang": lang } }));
  if (device) {
    await ddb.send(new UpdateCommand({ TableName: env.tableName, Key: { PK: device.PK, SK: device.SK }, UpdateExpression: "SET lang = :lang", ExpressionAttributeValues: { ":lang": lang } }));
  }
  return json(200, { lang });
}

/**
 * POST /parent/readings — the parent types in a measurement. It is stored as a number and nothing
 * more: the app never tells them what the reading means, and a reading never raises an alert.
 */
async function addParentReading(event: APIGatewayProxyEventV2) {
  const { parent, principal } = await requireParent(event);
  if (principal.kind !== "device") throw new HttpError(403, "Only a paired phone can do this");
  const input = parseBody(event, ReadingInputSchema);
  await authorize({
    principal: devicePrincipal(principal, parent.pid),
    action: "RecordReading",
    resource: parentEntity(parent),
    entities: [familyEntity(parent.fid)],
  });
  const reading = await recordReading({
    pid: parent.pid,
    checkId: input.checkId,
    values: input.values,
    at: input.at,
    doseId: input.doseId,
    recordedBy: { kind: "parent", id: principal.deviceId },
  });
  metrics.addMetric("ReadingsRecorded", "Count", 1);
  metrics.publishStoredMetrics();
  return json(201, { reading: { checkId: reading.checkId, type: reading.type, values: reading.values, at: reading.at, text: formatReading(reading.type, reading.values) } });
}

const NameBody = z.object({ displayName: DisplayNameSchema });

/** PUT /parent/name — the parent says what they are called, during setup or later. */
async function setName(event: APIGatewayProxyEventV2) {
  const { parent } = await requireParent(event);
  const { displayName } = parseBody(event, NameBody);
  await ddb.send(
    new UpdateCommand({ TableName: env.tableName, Key: { PK: parent.PK, SK: parent.SK }, UpdateExpression: "SET displayName = :name", ExpressionAttributeValues: { ":name": displayName } }),
  );
  return json(200, { displayName });
}

/**
 * POST /parent/prescriptions — the parent photographs their own prescription.
 *
 * They can start the reading but never finish it: the draft still goes to the family, and a family
 * member has to tick every line before a single medicine is saved. That keeps the confirmation with
 * the person best placed to check it against the paper.
 */
async function uploadPrescription(event: APIGatewayProxyEventV2) {
  const { parent, principal } = await requireParent(event);
  if (principal.kind !== "device") throw new HttpError(403, "Only a paired phone can do this");
  // The parent agreed on their own screen that the photo is read by AI, possibly outside India.
  parseBody(event, z.object({ consent: z.literal(true) }));
  await authorize({
    principal: devicePrincipal(principal, parent.pid),
    action: "UploadPrescription",
    resource: familyEntity(parent.fid),
    entities: [parentEntity(parent)],
  });
  const started = await startPrescription(parent.fid, parent.pid, `parent:${principal.deviceId}`);
  return json(201, started);
}

export const PARENT_ROUTES = {
  "POST /parent/pair": pair,
  "GET /parent/today": today,
  "GET /parent/doses/{doseId}": doseScreen,
  "POST /parent/readings": addParentReading,
  "POST /parent/prescriptions": uploadPrescription,
  "POST /parent/push/subscription": saveSubscription,
  "PUT /parent/name": setName,
  "PUT /parent/lang": setLanguage,
} as const;

export const handler = router(PARENT_ROUTES);
