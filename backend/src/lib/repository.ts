import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { doseSortKey, keys, parseDoseId } from "@dosecircle/shared";
import { ddb, isExpired } from "./aws.js";
import { env } from "./env.js";
import type { DeviceItem, DoseItem, MedicineItem, MemberItem, ParentItem, SlotItem } from "./model.js";

export async function get<T>(key: { PK: string; SK: string }, consistent = false): Promise<T | undefined> {
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

export async function listParents(fid: string): Promise<ParentItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :parent)",
      ExpressionAttributeValues: { ":pk": `FAM#${fid}`, ":parent": "PARENT#" },
    }),
  );
  return ((result.Items ?? []) as ParentItem[]).filter((p) => !isExpired(p));
}

/** Doses for a parent between two "yyyyMMddHHmm" stamps, inclusive, oldest first. */
export async function listDoses(pid: string, fromStamp: string, toStamp: string): Promise<DoseItem[]> {
  const items: DoseItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        // "~" sorts after "#" and digits, so demo/test runs (DOSE#stamp#n) at the last minute are included.
        ExpressionAttributeValues: { ":pk": `PARENT#${pid}`, ":from": `DOSE#${fromStamp}`, ":to": `DOSE#${toStamp}~` },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DoseItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items.filter((d) => !isExpired(d));
}

/**
 * The same, without "Send a test reminder" runs. A test proves the phone works; it is not a dose the
 * person was meant to take, so it must never count as taken or missed in what the family is shown.
 * Test runs carry a run number in their id. Demo families are all runs, so theirs are kept.
 */
export async function listRealDoses(pid: string, fromStamp: string, toStamp: string): Promise<DoseItem[]> {
  return (await listDoses(pid, fromStamp, toStamp)).filter(isRealDose);
}

export function isRealDose(dose: Pick<DoseItem, "doseId" | "fid">): boolean {
  return dose.fid.startsWith("demo-") || parseDoseId(dose.doseId).demoRun === undefined;
}

/** Doses currently escalating in a family (sparse GSI2). */
export async function listOpenDoses(fid: string): Promise<DoseItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": `FAM#${fid}#OPEN` },
      ScanIndexForward: false,
    }),
  );
  return ((result.Items ?? []) as DoseItem[]).filter((d) => !isExpired(d));
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
