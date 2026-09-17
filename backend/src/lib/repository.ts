import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { doseSortKey, keys, parseDoseId } from "@saathi/shared";
import { ddb, isExpired } from "./aws.js";
import { env } from "./env.js";
import type { DeviceItem, DoseItem, MedicineItem, MemberItem, ParentItem, SlotItem } from "./model.js";

async function get<T>(key: { PK: string; SK: string }, consistent = false): Promise<T | undefined> {
  const result = await ddb.send(new GetCommand({ TableName: env.tableName, Key: key, ConsistentRead: consistent }));
  const item = result.Item as (T & { ttl?: number }) | undefined;
  return isExpired(item) ? undefined : item;
}

export function doseKey(doseId: string): { PK: string; SK: string } {
  const { pid } = parseDoseId(doseId);
  return { PK: `PARENT#${pid}`, SK: doseSortKey(doseId) };
}

export const getDose = (doseId: string, consistent = true) => get<DoseItem>(doseKey(doseId), consistent);
export const getParent = (fid: string, pid: string) => get<ParentItem>(keys.parent(fid, pid));
export const getSlot = (pid: string, compactTime: string) => get<SlotItem>(keys.slot(pid, compactTime));
export const getMedicine = (pid: string, medId: string) => get<MedicineItem>(keys.medicine(pid, medId));
export const getDevice = (tokenHash: string) => get<DeviceItem>(keys.device(tokenHash));

export async function listMembers(fid: string): Promise<MemberItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :member)",
      ExpressionAttributeValues: { ":pk": `FAM#${fid}`, ":member": "MEMBER#" },
    }),
  );
  return ((result.Items ?? []) as MemberItem[]).filter((m) => !isExpired(m));
}

/** Parent devices are indexed under the parent for fan-out. */
export async function listParentDevices(pid: string): Promise<DeviceItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `PARENT#${pid}#DEVICES` },
    }),
  );
  return ((result.Items ?? []) as DeviceItem[]).filter((d) => !d.revoked && !isExpired(d as DeviceItem & { ttl?: number }));
}

/** A signed-in user's memberships (one family per user in this build). */
export async function membershipsForUser(sub: string): Promise<MemberItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `USER#${sub}` },
    }),
  );
  return ((result.Items ?? []) as MemberItem[]).filter((m) => !isExpired(m));
}
