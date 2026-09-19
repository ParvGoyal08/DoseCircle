import { isCheckDueAt, type SlotName } from "@dosecircle/shared";
import { isDueAt, istDate, istWeekday } from "../../scheduling/plan.js";

export type TestReminderBlock = { reason: "paused" | "no_medicines" | "nothing_due" | "no_phone" | "no_notifications"; status: number; message: string };

/**
 * Which slot a test reminder should use, or why none would reach the phone.
 *
 * The workflow used to discover each of these on its own and skip quietly, after the endpoint had
 * already told the family "on its way": a paused parent, a slot with nothing due today, a phone that
 * was never connected or never allowed notifications. "Due" is the same rule the workflow applies
 * when it creates the dose, so the two can't disagree.
 */
export function testReminderSlot<S extends { slotName: SlotName; medIds: string[]; checkIds?: string[] }>(input: {
  paused: boolean;
  slots: S[];
  medicines: Parameters<typeof isDueAt>[0][];
  checks: Parameters<typeof isCheckDueAt>[0][];
  phones: number;
  subscribed: boolean;
  slotName?: SlotName;
  now: Date;
}): { slot: S } | TestReminderBlock {
  if (input.paused) return { reason: "paused", status: 409, message: "Reminders are paused for this person" };
  if (input.slots.length === 0) return { reason: "no_medicines", status: 400, message: "Add a medicine first" };
  const today = istDate(input.now);
  const weekday = istWeekday(input.now);
  const due = (slot: S) =>
    input.medicines.some((m) => slot.medIds.includes(m.medId) && isDueAt(m, slot.slotName, today)) ||
    input.checks.some((c) => (slot.checkIds ?? []).includes(c.checkId) && isCheckDueAt(c, slot.slotName, today, weekday));
  const slot = (input.slotName ? input.slots.filter((s) => s.slotName === input.slotName) : input.slots).find(due);
  if (!slot) return { reason: "nothing_due", status: 409, message: "Nothing is due today" };
  if (input.phones === 0) return { reason: "no_phone", status: 409, message: "Their phone is not connected yet" };
  if (!input.subscribed) return { reason: "no_notifications", status: 409, message: "Their phone has not allowed notifications yet" };
  return { slot };
}
