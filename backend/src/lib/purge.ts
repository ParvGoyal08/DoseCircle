import { DeleteScheduleCommand, ResourceNotFoundException, SchedulerClient } from "@aws-sdk/client-scheduler";
import { StopExecutionCommand } from "@aws-sdk/client-sfn";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { isDemoFamily } from "@dosecircle/shared";
import { scheduleName } from "../scheduling/plan.js";
import { ddb, FAST_CLIENT_CONFIG, logger, sfn } from "./aws.js";
import { env, requireEnv } from "./env.js";
import type { DeviceItem, DoseItem, MemberItem, ParentItem } from "./model.js";
import { listParentDevices, listParents } from "./repository.js";

const scheduler = new SchedulerClient(FAST_CLIENT_CONFIG);

async function itemsUnder(pk: string): Promise<{ PK: string; SK: string }[]> {
  const items: { PK: string; SK: string }[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        // Whole items: they are small, and naming fields here tripped over reserved words ("sub", "status").
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
    const counts = await deleteParentRecords(fid, parent.pid);
    items += counts.items;
    schedules += counts.schedules;
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

/**
 * Removes one person the family looks after and everything about them: running reminders are
 * stopped first (a workflow still in flight would otherwise write fresh records after the delete),
 * then their schedules, connected phones and those phones' push subscriptions, their medicines,
 * checks, readings, doses and dose events, and finally the person themselves.
 */
export async function deleteParentRecords(fid: string, pid: string): Promise<{ items: number; schedules: number; stopped: number }> {
  const parentItems = (await itemsUnder(`PARENT#${pid}`)) as ({ PK: string; SK: string } & Partial<DoseItem>)[];
  let items = 0;
  let schedules = 0;
  let stopped = 0;

  for (const dose of parentItems) {
    if (!dose.SK.startsWith("DOSE#") || !(dose.status === "PENDING" || dose.status === "ESCALATING")) continue;
    if (!dose.executionArn?.startsWith("arn:")) continue;
    try {
      await sfn.send(new StopExecutionCommand({ executionArn: dose.executionArn, cause: "The person was removed from the family" }));
      stopped += 1;
    } catch (error) {
      // Already finished: nothing left to stop.
      logger.info("Could not stop execution", { executionArn: dose.executionArn, error: (error as Error).message });
    }
  }

  if (!isDemoFamily(fid)) {
    for (const item of parentItems) {
      if (!item.SK.startsWith("SLOT#")) continue;
      try {
        await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName(pid, item.SK.slice("SLOT#".length)), GroupName: requireEnv("SCHEDULE_GROUP") }));
        schedules += 1;
      } catch (error) {
        if (!(error instanceof ResourceNotFoundException)) throw error;
      }
    }
  }

  const devices: DeviceItem[] = await listParentDevices(pid).catch(() => []);
  for (const device of devices) items += await deleteAll(await itemsUnder(`SUBJ#${device.deviceId}`));
  items += await deleteAll(devices.map((d) => ({ PK: d.PK, SK: d.SK })));

  // Dose events live under their own partition.
  for (const item of parentItems) {
    if (item.SK.startsWith("DOSE#") && item.doseId) items += await deleteAll(await itemsUnder(`DOSE#${item.doseId}`));
  }
  items += await deleteAll(parentItems);
  items += await deleteAll([{ PK: `FAM#${fid}`, SK: `PARENT#${pid}` }]);

  logger.info("Parent data deleted", { fid, pid, items, schedules, stopped });
  return { items, schedules, stopped };
}
