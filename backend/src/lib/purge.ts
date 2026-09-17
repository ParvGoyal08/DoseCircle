import { DeleteScheduleCommand, ResourceNotFoundException, SchedulerClient } from "@aws-sdk/client-scheduler";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { isDemoFamily } from "@dosecircle/shared";
import { scheduleName } from "../scheduling/plan.js";
import { ddb, logger } from "./aws.js";
import { env, requireEnv } from "./env.js";
import type { DeviceItem, DoseItem, MemberItem, ParentItem } from "./model.js";
import { listParentDevices, listParents } from "./repository.js";

const scheduler = new SchedulerClient({});

async function itemsUnder(pk: string): Promise<{ PK: string; SK: string }[]> {
  const items: { PK: string; SK: string }[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ProjectionExpression: "PK, SK, doseId, mid, sub, deviceId, pid",
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as { PK: string; SK: string }[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function deleteAll(items: { PK: string; SK: string }[]): Promise<number> {
  for (const key of items) await ddb.send(new DeleteCommand({ TableName: env.tableName, Key: { PK: key.PK, SK: key.SK } }));
  return items.length;
}

/**
 * Removes every record belonging to a family: parents and their medicines, daily checks, readings,
 * doses and dose events, paired phones, members and their push subscriptions, prescriptions, and the
 * EventBridge schedules. Deliberately item-by-item rather than in batches: a family is small, and a
 * partial batch failure would be far harder to reason about than a slow loop.
 */
export async function deleteFamilyData(fid: string): Promise<{ items: number; schedules: number }> {
  const familyItems = (await itemsUnder(`FAM#${fid}`)) as (MemberItem | ParentItem | { PK: string; SK: string })[];
  const parents = await listParents(fid);
  let items = 0;
  let schedules = 0;

  for (const parent of parents) {
    const parentItems = await itemsUnder(`PARENT#${parent.pid}`);
    // Dose events live under their own partition.
    for (const item of parentItems) {
      if (!item.SK.startsWith("DOSE#")) continue;
      const doseId = (item as DoseItem).doseId;
      if (doseId) items += await deleteAll(await itemsUnder(`DOSE#${doseId}`));
    }

    const devices: DeviceItem[] = await listParentDevices(parent.pid).catch(() => []);
    items += await deleteAll(devices.map((d) => ({ PK: d.PK, SK: d.SK })));

    if (!isDemoFamily(fid)) {
      for (const item of parentItems) {
        if (!item.SK.startsWith("SLOT#")) continue;
        const compactTime = item.SK.slice("SLOT#".length);
        try {
          await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName(parent.pid, compactTime), GroupName: requireEnv("SCHEDULE_GROUP") }));
          schedules += 1;
        } catch (error) {
          if (!(error instanceof ResourceNotFoundException)) throw error;
        }
      }
    }

    items += await deleteAll(parentItems);
  }

  for (const item of familyItems) {
    if (!item.SK.startsWith("MEMBER#")) continue;
    const member = item as MemberItem;
    items += await deleteAll(await itemsUnder(`SUBJ#${member.mid}`));
    // Releasing the one-family lock lets each person start or join another family.
    if (member.sub) await ddb.send(new DeleteCommand({ TableName: env.tableName, Key: { PK: `USER#${member.sub}`, SK: "FAMILY" } }));
  }

  // The family row itself (SK "META") is part of this list.
  items += await deleteAll(familyItems.map((item) => ({ PK: item.PK, SK: item.SK })));

  logger.info("Family data deleted", { fid, items, schedules });
  return { items, schedules };
}
