import { PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { keys, voicePhrasePath, type LanguageCode, type SlotName } from "@dosecircle/shared";
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
import type { DeviceItem, DoseItem, InviteItem, MedicineItem, ParentItem } from "../../lib/model.js";
import { PushSubscriptionSchema } from "../../lib/push-endpoints.js";
import { get, getDose, getParent, listDoses } from "../../lib/repository.js";
import { router } from "../../lib/router.js";
import { LanguageSchema } from "../../lib/schemas.js";
import { istDate } from "../../scheduling/plan.js";
import { listMedicines, listSlots } from "../../scheduling/sync-slots.js";

const PairSchema = z.object({ code: z.string().min(6).max(20) });

/**
 * POST /parent/pair (public) — the parent's phone exchanges a one-time code for a long-lived device
 * token. Elderly parents never create a password. Only hashes of the code and token are stored.
 */
async function pair(event: APIGatewayProxyEventV2) {
  const { code } = parseBody(event, PairSchema);
  const inviteKey = keys.invite(sha256Hex(normaliseInviteCode(code)));
  const invite = await get<InviteItem>(inviteKey, true);
  if (!invite || invite.kind !== "parent" || !invite.pid || invite.consumedAt) throw new HttpError(404, "This code is not valid any more. Ask your family for a new one.");
  const parent = await getParent(invite.fid, invite.pid);
  if (!parent) throw new HttpError(404, "This code is not valid any more. Ask your family for a new one.");

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

async function requireParent(event: APIGatewayProxyEventV2): Promise<{ parent: ParentItem; principal: Awaited<ReturnType<typeof principalFrom>> }> {
  const principal = await principalFrom(event);
  if (principal.kind !== "device") throw new HttpError(403, "Only a paired phone can do this");
  const parent = await getParent(principal.fid, principal.pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  await authorize({ principal: devicePrincipal(principal, parent.pid), action: "ViewParent", resource: parentEntity(parent), entities: [familyEntity(parent.fid)] });
  return { parent, principal };
}

/** GET /parent/today — the parent's calm "today" screen. */
async function today(event: APIGatewayProxyEventV2) {
  const { parent } = await requireParent(event);
  const date = istDate().replaceAll("-", "");
  const [slots, medicines, doses] = await Promise.all([listSlots(parent.pid), listMedicines(parent.pid), listDoses(parent.pid, `${date}0000`, `${date}2359`)]);
  const byId = new Map(medicines.map((m) => [m.medId, m]));
  const realDoses = doses.filter((d) => d.SK.split("#").length === 2);

  return json(200, {
    parent: { displayName: parent.displayName, lang: parent.lang, paused: parent.paused },
    slots: slots
      .sort((a, b) => a.compactTime.localeCompare(b.compactTime))
      .map((slot) => {
        const dose = realDoses.find((d) => d.slotName === slot.slotName);
        return {
          slotName: slot.slotName,
          time: `${slot.compactTime.slice(0, 2)}:${slot.compactTime.slice(2)}`,
          medicines: slot.medIds.map((id) => byId.get(id)).filter((m): m is MedicineItem => Boolean(m)).map((m) => medicineLine(m, slot.slotName)),
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
  const [parent, medicines] = await Promise.all([getParent(dose.fid, dose.pid), listMedicines(dose.pid)]);
  const lang = (parent?.lang ?? "en") as LanguageCode;
  return {
    doseId: dose.doseId,
    status: dose.status,
    slotName: dose.slotName,
    scheduledAt: dose.scheduledAt,
    critical: dose.critical,
    parent: { displayName: parent?.displayName ?? "", lang },
    medicines: dose.medIds.map((id) => medicines.find((m) => m.medId === id)).filter((m): m is MedicineItem => Boolean(m)).map((m) => medicineLine(m, dose.slotName)),
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

export const PARENT_ROUTES = {
  "POST /parent/pair": pair,
  "GET /parent/today": today,
  "GET /parent/doses/{doseId}": doseScreen,
  "POST /parent/push/subscription": saveSubscription,
  "PUT /parent/lang": setLanguage,
} as const;

export const handler = router(PARENT_ROUTES);
