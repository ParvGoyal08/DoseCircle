import { StartExecutionCommand } from "@aws-sdk/client-sfn";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { keys, SLOT_NAMES, type SlotName } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { authorize } from "../../authz/avp.js";
import { familyEntity, parentEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb, sfn, ttlInHours } from "../../lib/aws.js";
import { newInviteCode, sha256Hex } from "../../lib/crypto.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, pathParam, principalFrom } from "../../lib/http.js";
import type { DeviceItem, InviteItem, ParentItem } from "../../lib/model.js";
import { PushSubscriptionSchema } from "../../lib/push-endpoints.js";
import { subscriptionsFor } from "../../lib/webpush.js";
import { testReminderSlot } from "./test-reminder.js";
import { takeFromBudget } from "../../lib/rate-limit.js";
import { getParent, listMembers } from "../../lib/repository.js";
import { DisplayNameSchema, LanguageSchema, SlotNameSchema, TimeSchema } from "../../lib/schemas.js";
import { listChecks, listMedicines, listSlots, syncSlots } from "../../scheduling/sync-slots.js";

async function parentFor(event: APIGatewayProxyEventV2): Promise<{ fid: string; pid: string; parent: ParentItem }> {
  const fid = pathParam(event, "fid");
  const pid = pathParam(event, "pid");
  const parent = await getParent(fid, pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  return { fid, pid, parent };
}

const InviteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("member") }),
  z.object({ kind: z.literal("parent"), pid: z.string().min(1).max(40) }),
]);

/**
 * POST /families/{fid}/invites — a one-time code. Only its hash is stored. A member invite adds a
 * family member; a parent invite pairs a parent's phone (no password for the parent, ever).
 */
export async function createInvite(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const body = parseBody(event, InviteSchema);
  const { entity, member } = await memberPrincipal(await principalFrom(event));

  if (body.kind === "member") {
    await authorize({ principal: entity, action: "ManageFamily", resource: familyEntity(fid), entities: [familyEntity(member.fid)] });
  } else {
    const parent = await getParent(fid, body.pid);
    if (!parent) throw new HttpError(404, "Parent not found");
    await authorize({ principal: entity, action: "ManageDevices", resource: parentEntity(parent), entities: [familyEntity(fid)] });
  }

  const code = newInviteCode();
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const invite: InviteItem = {
    ...keys.invite(sha256Hex(code)),
    kind: body.kind,
    fid,
    pid: body.kind === "parent" ? body.pid : undefined,
    createdBy: member.mid,
    ttl: ttlInHours(48),
  };
  await ddb.send(new PutCommand({ TableName: env.tableName, Item: invite, ConditionExpression: "attribute_not_exists(PK)" }));
  // The code travels in the URL fragment, so it never reaches server or CDN logs. A parent invite
  // carries the language the family chose too, so the first screen the parent sees is already in
  // their own script rather than a picker they cannot read.
  const path = body.kind === "parent" ? "/join" : "/invite";
  const lang = body.kind === "parent" ? `&l=${(await getParent(fid, body.pid))?.lang ?? "en"}` : "";
  return json(201, { code, link: `${env.appOrigin}${path}#c=${code}${lang}`, expiresAt });
}

const LadderSchema = z.object({ memberIds: z.array(z.string().min(1).max(40)).min(1).max(20) });

/** PUT /families/{fid}/parents/{pid}/ladder — who is alerted first, second, … */
export async function setLadder(event: APIGatewayProxyEventV2) {
  const { fid, pid, parent } = await parentFor(event);
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ManageFamily", resource: familyEntity(fid), entities: [] });

  const { memberIds } = parseBody(event, LadderSchema);
  const known = new Set((await listMembers(fid)).map((m) => m.mid));
  if (new Set(memberIds).size !== memberIds.length) throw new HttpError(400, "Each person can appear only once");
  if (memberIds.some((mid) => !known.has(mid))) throw new HttpError(400, "Everyone in the order must be a family member");

  await ddb.send(
    new UpdateCommand({ TableName: env.tableName, Key: { PK: parent.PK, SK: parent.SK }, UpdateExpression: "SET ladder = :ladder", ExpressionAttributeValues: { ":ladder": memberIds } }),
  );
  return json(200, { pid, ladder: memberIds });
}

const ParentUpdateSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    lang: LanguageSchema.optional(),
    slotTimes: z.object({ morning: TimeSchema.optional(), afternoon: TimeSchema.optional(), evening: TimeSchema.optional(), night: TimeSchema.optional() }).optional(),
    paused: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to update");

/** PATCH /families/{fid}/parents/{pid} — name, language, times of day, or pausing reminders (travel, hospital). */
export async function updateParent(event: APIGatewayProxyEventV2) {
  const { fid, pid, parent } = await parentFor(event);
  const body = parseBody(event, ParentUpdateSchema);
  const { entity } = await memberPrincipal(await principalFrom(event));
  const resource = parentEntity(parent);
  if (body.paused !== undefined) await authorize({ principal: entity, action: "PauseReminders", resource, entities: [familyEntity(fid)] });
  if (body.displayName || body.lang || body.slotTimes) await authorize({ principal: entity, action: "ManageMedicines", resource, entities: [familyEntity(fid)] });

  const slotTimes = body.slotTimes ? { ...parent.slotTimes, ...body.slotTimes } : undefined;
  if (slotTimes) {
    const times = SLOT_NAMES.map((slot) => slotTimes[slot]).filter(Boolean);
    if (new Set(times).size !== times.length) throw new HttpError(400, "Two times of day cannot share the same time");
  }

  const sets: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  const set = (field: string, value: unknown) => {
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    sets.push(`#${field} = :${field}`);
  };
  if (body.displayName) set("displayName", body.displayName);
  if (body.lang) set("lang", body.lang);
  if (slotTimes) set("slotTimes", slotTimes);
  if (body.paused !== undefined) set("paused", body.paused);

  await ddb.send(
    new UpdateCommand({ TableName: env.tableName, Key: { PK: parent.PK, SK: parent.SK }, UpdateExpression: `SET ${sets.join(", ")}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values }),
  );
  if (slotTimes || body.paused !== undefined) await syncSlots(fid, pid);
  return json(200, { pid, updated: Object.keys(body) });
}

const TestDoseSchema = z.object({ slotName: SlotNameSchema.optional() });

/** POST /families/{fid}/parents/{pid}/test-dose — send a reminder now, at 10× speed, to check the phone works. */
export async function sendTestDose(event: APIGatewayProxyEventV2) {
  const { fid, pid, parent } = await parentFor(event);
  const body = parseBody(event, TestDoseSchema);
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "SendTestReminder", resource: parentEntity(parent), entities: [familyEntity(fid)] });

  // Every reason a test reminder would never reach the phone is checked before starting the workflow,
  // and none of them spends one of the three tests a day. See testReminderSlot.
  const [slots, medicines, checks, phones] = await Promise.all([listSlots(pid), listMedicines(pid), listChecks(pid), devicesOf(pid)]);
  const live = phones.filter((d) => !d.revoked);
  const subscribed = (await Promise.all(live.map((d) => subscriptionsFor(d.deviceId)))).some((list) => list.length > 0);
  const choice = testReminderSlot({ paused: parent.paused === true, slots, medicines, checks, phones: live.length, subscribed, slotName: body.slotName, now: new Date() });
  if ("reason" in choice) throw new HttpError(choice.status, choice.message, { reason: choice.reason });
  const slot = choice.slot;

  if (!(await takeFromBudget(`test-dose#${pid}#${new Date().toISOString().slice(0, 10)}`, 3, 86_400))) {
    throw new HttpError(429, "You can send 3 test reminders a day", { reason: "limit" });
  }

  const execution = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: env.stateMachineArn,
      input: JSON.stringify({ fid, pid, slot: slot.compactTime, mode: "test", speed: 10, demoRun: Math.floor(Date.now() / 1000) % 100_000 }),
    }),
  );
  return json(202, { executionArn: execution.executionArn, slotName: slot.slotName as SlotName });
}

async function devicesOf(pid: string): Promise<DeviceItem[]> {
  const result = await ddb.send(
    new QueryCommand({ TableName: env.tableName, IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": `PARENT#${pid}#DEVICES` } }),
  );
  return (result.Items ?? []) as DeviceItem[];
}

/** GET /families/{fid}/parents/{pid}/devices — the phones paired to a parent. */
export async function listDevices(event: APIGatewayProxyEventV2) {
  const { fid, pid, parent } = await parentFor(event);
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ManageDevices", resource: parentEntity(parent), entities: [familyEntity(fid)] });
  const devices = await devicesOf(pid);
  return json(200, {
    devices: devices.filter((d) => !d.revoked).map((d) => ({ deviceId: d.deviceId, pairedAt: d.pairedAt ?? null, lang: d.lang })),
    lastReceiptAt: parent.lastReceiptAt ?? null,
  });
}

/** DELETE /families/{fid}/parents/{pid}/devices/{deviceId} — a lost phone stops working immediately (within the 5-minute authorizer cache). */
export async function revokeDevice(event: APIGatewayProxyEventV2) {
  const { fid, pid, parent } = await parentFor(event);
  const deviceId = pathParam(event, "deviceId");
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ManageDevices", resource: parentEntity(parent), entities: [familyEntity(fid)] });
  const device = (await devicesOf(pid)).find((d) => d.deviceId === deviceId);
  if (!device) throw new HttpError(404, "Phone not found");
  await ddb.send(
    new UpdateCommand({ TableName: env.tableName, Key: { PK: device.PK, SK: device.SK }, UpdateExpression: "SET revoked = :true, revokedAt = :now", ExpressionAttributeValues: { ":true": true, ":now": new Date().toISOString() } }),
  );
  return json(200, { deviceId, revoked: true });
}

const SubscriptionBody = z.object({ subscription: PushSubscriptionSchema });

/** POST /push/subscriptions — a family member's browser can receive alerts. */
export async function saveMemberSubscription(event: APIGatewayProxyEventV2) {
  const principal = await principalFrom(event);
  if (principal.kind !== "member") throw new HttpError(403, "Only family members can do this");
  const { subscription } = parseBody(event, SubscriptionBody);
  const member = (await listMembers(principal.fid)).find((m) => m.mid === principal.mid);
  await ddb.send(
    new PutCommand({
      TableName: env.tableName,
      Item: { ...keys.pushSubscription(principal.mid, sha256Hex(subscription.endpoint)), subjectId: principal.mid, subscription, lang: member?.lang ?? "en", savedAt: new Date().toISOString() },
    }),
  );
  return json(201, { saved: true });
}
