import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { istDoseStamp, makeDoseId, doseSortKey, timingsFor, toCompactTime, type LadderTimings } from "@dosecircle/shared";
import { ddb, logger, ttlInDays, ttlInHours } from "../lib/aws.js";
import { env } from "../lib/env.js";
import type { DoseItem } from "../lib/model.js";
import { getParent, getSlot } from "../lib/repository.js";

export interface PrepareDoseInput {
  input: {
    fid: string;
    pid: string;
    /** "HH:MM" or "HHMM" slot time. */
    slot: string;
    /** From EventBridge Scheduler's <aws.scheduler.scheduled-time>; absent for demo and test doses. */
    scheduledTime?: string;
    mode: "live" | "demo" | "test";
    speed?: number;
    /** Demo toggles. */
    critical?: boolean;
    demoRun?: number;
  };
  executionId: string;
}

export interface PrepareDoseOutput {
  dose: {
    doseId: string;
    doseSk: string;
    fid: string;
    pid: string;
    critical: boolean;
    consecutiveMisses: number;
    ladderSize: number;
    duplicate: boolean;
    paused: boolean;
  };
  ladders: { standard: LadderTimings; fast: LadderTimings };
}

export async function handler(event: PrepareDoseInput): Promise<PrepareDoseOutput> {
  const { input, executionId } = event;
  const speed = input.speed ?? 1;
  const compactTime = input.slot.includes(":") ? toCompactTime(input.slot) : input.slot;
  const ladders = { standard: timingsFor("standard", speed), fast: timingsFor("fast", speed) };

  const [parent, slot] = await Promise.all([getParent(input.fid, input.pid), getSlot(input.pid, compactTime)]);
  if (!parent || !slot) {
    logger.warn("Parent or slot missing; skipping dose", { fid: input.fid, pid: input.pid, compactTime });
    return {
      dose: { doseId: "", doseSk: "", fid: input.fid, pid: input.pid, critical: false, consecutiveMisses: 0, ladderSize: 0, duplicate: true, paused: false },
      ladders,
    };
  }

  const scheduledAt = input.scheduledTime ?? new Date().toISOString();
  const doseStamp = istDoseStamp(new Date(scheduledAt));
  const doseId = makeDoseId(input.pid, doseStamp, input.mode === "live" ? undefined : input.demoRun ?? 0);
  const critical = slot.critical || input.critical === true;

  const item: DoseItem = {
    PK: `PARENT#${input.pid}`,
    SK: doseSortKey(doseId),
    doseId,
    fid: input.fid,
    pid: input.pid,
    slotName: slot.slotName,
    medIds: slot.medIds,
    status: parent.paused ? "SKIPPED" : "PENDING",
    critical,
    scheduledAt,
    executionArn: executionId,
    channel: input.mode === "demo" ? "inbox" : "webpush",
    ttl: input.mode === "live" ? ttlInDays(120) : ttlInHours(2),
  };

  let duplicate = false;
  try {
    // EventBridge Scheduler delivers at least once: the dose id (parent + IST minute) makes this idempotent.
    await ddb.send(new PutCommand({ TableName: env.tableName, Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
  } catch (error) {
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    duplicate = true;
    logger.info("Duplicate dose start ignored", { doseId });
  }

  return {
    dose: {
      doseId,
      doseSk: item.SK,
      fid: input.fid,
      pid: input.pid,
      critical,
      consecutiveMisses: parent.consecutiveMisses ?? 0,
      ladderSize: parent.ladder.length,
      duplicate,
      paused: parent.paused,
    },
    ladders,
  };
}
