import type { SlotCounts } from "./slots.js";

export const DEFAULT_REFILL_THRESHOLD_DAYS = 5;

/** Pills used per day from scheduled slots. As-needed medicines never count. */
export function dailyUse(medicine: { slots: SlotCounts; asNeeded: boolean }): number {
  if (medicine.asNeeded) return 0;
  return Object.values(medicine.slots).reduce<number>((sum, count) => sum + (count ?? 0), 0);
}

export function daysLeft(pillsLeft: number, perDay: number): number | null {
  if (perDay <= 0) return null;
  return Math.floor(pillsLeft / perDay);
}

export function shouldWarnRefill(input: {
  pillsLeft: number;
  perDay: number;
  thresholdDays: number;
  alreadyAlerted: boolean;
}): boolean {
  if (input.alreadyAlerted) return false;
  const left = daysLeft(input.pillsLeft, input.perDay);
  return left !== null && left <= input.thresholdDays;
}

/** Called only after a Taken succeeds. Missed doses never reduce the count. */
export function decrementPills(pillsLeft: number, taken: number): { pillsLeft: number; needsRecount: boolean } {
  if (taken <= pillsLeft) return { pillsLeft: pillsLeft - taken, needsRecount: false };
  return { pillsLeft: 0, needsRecount: true };
}
