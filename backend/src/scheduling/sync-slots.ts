import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
} from "@aws-sdk/client-scheduler";
import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_SLOT_TIMES, isDemoFamily, keys, type SlotName } from "@dosecircle/shared";
import { ddb, FAST_CLIENT_CONFIG, logger } from "../lib/aws.js";
import { env, requireEnv } from "../lib/env.js";
import type { CheckItem, MedicineItem, ParentItem, SlotItem } from "../lib/model.js";
import { getParent } from "../lib/repository.js";
import { dailyCron, desiredSlots, diffSlots, istDate, scheduleName, type DesiredSlot } from "./plan.js";

const scheduler = new SchedulerClient(FAST_CLIENT_CONFIG);

async function listByPrefix<T>(pk: string, prefix: string): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as T[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export const listMedicines = (pid: string) => listByPrefix<MedicineItem>(`PARENT#${pid}`, "MED#");
export const listSlots = (pid: string) => listByPrefix<SlotItem>(`PARENT#${pid}`, "SLOT#");
export const listChecks = (pid: string) => listByPrefix<CheckItem>(`PARENT#${pid}`, "CHECK#");

function scheduleInput(parent: ParentItem, slot: DesiredSlot): CreateScheduleCommandInput {
  return {
    Name: scheduleName(parent.pid, slot.compactTime),
    GroupName: requireEnv("SCHEDULE_GROUP"),
    ScheduleExpression: dailyCron(slot.compactTime),
    ScheduleExpressionTimezone: "Asia/Kolkata",
    FlexibleTimeWindow: { Mode: "OFF" },
    State: parent.paused ? "DISABLED" : "ENABLED",
    Target: {
      // Templated target: Scheduler starts the workflow directly, no Lambda in between.
      Arn: requireEnv("STATE_MACHINE_ARN"),
      RoleArn: requireEnv("SCHEDULER_ROLE_ARN"),
      Input: JSON.stringify({ fid: parent.fid, pid: parent.pid, slot: slot.compactTime, mode: "live", scheduledTime: "<aws.scheduler.scheduled-time>" }),
      RetryPolicy: { MaximumRetryAttempts: 3, MaximumEventAgeInSeconds: 600 },
      DeadLetterConfig: { Arn: requireEnv("SCHEDULER_DLQ_ARN") },
    },
  };
}

async function upsertSchedule(input: CreateScheduleCommandInput): Promise<void> {
  try {
    await scheduler.send(new UpdateScheduleCommand(input));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
    try {
      await scheduler.send(new CreateScheduleCommand(input));
    } catch (createError) {
      if (!(createError instanceof ConflictException)) throw createError;
      await scheduler.send(new UpdateScheduleCommand(input));
    }
  }
}

/**
 * Brings EventBridge Scheduler and the slot items in line with the parent's active medicines,
 * time-of-day settings and pause state. Safe to call repeatedly.
 */
export async function syncSlots(fid: string, pid: string): Promise<DesiredSlot[]> {
  const parent = await getParent(fid, pid);
  if (!parent) throw new Error(`Parent ${pid} not found`);
  const slotTimes = { ...DEFAULT_SLOT_TIMES, ...parent.slotTimes } as Record<SlotName, string>;
  const [medicines, checks, existing] = await Promise.all([listMedicines(pid), listChecks(pid), listSlots(pid)]);
  const desired = desiredSlots(medicines, checks, slotTimes, istDate());
  const changes = diffSlots(existing, desired);

  for (const slot of [...changes.create, ...changes.update]) {
    const item: SlotItem = {
      ...keys.slot(pid, slot.compactTime),
      pid,
      compactTime: slot.compactTime,
      slotName: slot.slotName,
      medIds: slot.medIds,
      checkIds: slot.checkIds,
      critical: slot.critical,
    };
    // Demo families never get real schedules: the demo starts executions on demand.
    if (!isDemoFamily(fid)) item.scheduleName = scheduleName(pid, slot.compactTime);
    await ddb.send(new PutCommand({ TableName: env.tableName, Item: item }));
  }

  if (!isDemoFamily(fid)) {
    // Every current slot's schedule is upserted so pause/resume and time edits always apply.
    for (const slot of desired) await upsertSchedule(scheduleInput(parent, slot));
    for (const slot of changes.remove) {
      try {
        await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName(pid, slot.compactTime), GroupName: requireEnv("SCHEDULE_GROUP") }));
      } catch (error) {
        if (!(error instanceof ResourceNotFoundException)) throw error;
      }
    }
  }

  for (const slot of changes.remove) {
    await ddb.send(new DeleteCommand({ TableName: env.tableName, Key: keys.slot(pid, slot.compactTime) }));
  }

  logger.info("Slots synced", { pid, created: changes.create.length, updated: changes.update.length, removed: changes.remove.length });
  return desired;
}
