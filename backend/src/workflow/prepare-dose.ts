import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { isCheckDueAt, istDoseStamp, makeDoseId, doseSortKey, timingsFor, toCompactTime, type LadderTimings } from "@dosecircle/shared";
import { ddb, logger, ttlInDays, ttlInHours } from "../lib/aws.js";
import { env } from "../lib/env.js";
import type { DoseItem } from "../lib/model.js";
import { getParent, getSlot } from "../lib/repository.js";
import { isDueAt, istDate, istWeekday } from "../scheduling/plan.js";
import { listChecks, listMedicines } from "../scheduling/sync-slots.js";

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
    /** Whether an unanswered reminder should alert the family at all. */
    escalates: boolean;
    consecutiveMisses: number;
    ladderSize: number;
    duplicate: boolean;
    paused: boolean;
    /** False for "Send a test reminder": a test must not change how fast real doses escalate. */
    countsTowardStreak: boolean;
  };
  ladders: { standard: LadderTimings; fast: LadderTimings };
}

const SKIPPED = (fid: string, pid: string) => ({
  doseId: "",
  doseSk: "",
  fid,
  pid,
  critical: false,
  escalates: false,
  consecutiveMisses: 0,
  ladderSize: 0,
  duplicate: true,
  paused: false,
  countsTowardStreak: false,
});

export async function handler(event: PrepareDoseInput): Promise<PrepareDoseOutput> {
  const { input, executionId } = event;
  const speed = input.speed ?? 1;
  const compactTime = input.slot.includes(":") ? toCompactTime(input.slot) : input.slot;
  const ladders = { standard: timingsFor("standard", speed), fast: timingsFor("fast", speed) };

  const [parent, slot, medicines, checks] = await Promise.all([
    getParent(input.fid, input.pid),
    getSlot(input.pid, compactTime),
    listMedicines(input.pid),
    listChecks(input.pid),
  ]);
  if (!parent || !slot) {
    logger.warn("Parent or slot missing; skipping dose", { fid: input.fid, pid: input.pid, compactTime });
    return { dose: SKIPPED(input.fid, input.pid), ladders };
  }

  const scheduledAt = input.scheduledTime ?? new Date().toISOString();
  // A medicine can be stopped or reach its last day between schedule syncs, and a check may only be
  // asked for on some weekdays, so both lists are worked out again here, at the moment the dose is created.
  const scheduledDate = new Date(scheduledAt);
  const today = istDate(scheduledDate);
  const weekday = istWeekday(scheduledDate);
  const due = medicines.filter((m) => slot.medIds.includes(m.medId) && isDueAt(m, slot.slotName, today));
  const dueChecks = checks.filter((c) => (slot.checkIds ?? []).includes(c.checkId) && isCheckDueAt(c, slot.slotName, today, weekday));
  if (due.length === 0 && dueChecks.length === 0) {
    logger.info("Nothing is still due in this slot; skipping dose", { pid: input.pid, compactTime, slot: slot.slotName });
    return { dose: SKIPPED(input.fid, input.pid), ladders };
  }
  const doseStamp = istDoseStamp(scheduledDate);
  const doseId = makeDoseId(input.pid, doseStamp, input.mode === "live" ? undefined : input.demoRun ?? 0);
  const critical = due.some((m) => m.critical) || input.critical === true;
  // Medicines always alert the family. A checks-only reminder does so only if the family asked for it,
  // so a forgotten weigh-in never wakes anyone at night.
  const escalates = due.length > 0 || dueChecks.some((c) => c.escalates);

  const item: DoseItem = {
    PK: `PARENT#${input.pid}`,
    SK: doseSortKey(doseId),
    doseId,
    fid: input.fid,
    pid: input.pid,
    slotName: slot.slotName,
    medIds: due.map((m) => m.medId),
    checkIds: dueChecks.map((c) => c.checkId),
    escalates,
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
      escalates,
      consecutiveMisses: parent.consecutiveMisses ?? 0,
      ladderSize: parent.ladder.length,
      duplicate,
      paused: parent.paused,
      countsTowardStreak: input.mode !== "test",
    },
    ladders,
  };
}
