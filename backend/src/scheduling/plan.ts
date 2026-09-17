import { isCheckDueAt, SLOT_NAMES, toCompactTime, type PlannedCheck, type SlotName } from "@dosecircle/shared";

/** Pure planning for dose schedules, kept separate from AWS calls so it can be unit-tested. */

export interface PlannedMedicine {
  medId: string;
  slots: Partial<Record<SlotName, number | null>>;
  critical: boolean;
  asNeeded: boolean;
  active: boolean;
  /** "yyyy-MM-dd"; the medicine stops after this day. */
  endDate?: string;
}

export interface DesiredSlot {
  compactTime: string;
  slotName: SlotName;
  medIds: string[];
  checkIds: string[];
  critical: boolean;
}

/** Whether a medicine should still be reminded about at this time of day. */
export function isDueAt(medicine: PlannedMedicine, slotName: SlotName, todayIst: string): boolean {
  return medicine.active && !medicine.asNeeded && (!medicine.endDate || medicine.endDate >= todayIst) && (medicine.slots[slotName] ?? 0) > 0;
}

/**
 * One reminder per time of day, grouping every medicine and daily check asked for then.
 * Critical if any medicine is. A check that only runs on some weekdays still needs a daily schedule:
 * the workflow decides on the day whether it is actually due.
 */
export function desiredSlots(
  medicines: readonly PlannedMedicine[],
  checks: readonly PlannedCheck[],
  slotTimes: Readonly<Record<SlotName, string>>,
  todayIst: string,
): DesiredSlot[] {
  const slots: DesiredSlot[] = [];
  for (const slotName of SLOT_NAMES) {
    const due = medicines.filter((m) => isDueAt(m, slotName, todayIst));
    // Any weekday, because the schedule is daily and the day is checked when the dose is prepared.
    const dueChecks = checks.filter((c) => c.active && c.slots.includes(slotName) && (!c.endDate || c.endDate >= todayIst));
    if (due.length === 0 && dueChecks.length === 0) continue;
    slots.push({
      compactTime: toCompactTime(slotTimes[slotName]),
      slotName,
      medIds: due.map((m) => m.medId).sort(),
      checkIds: dueChecks.map((c) => c.checkId).sort(),
      critical: due.some((m) => m.critical),
    });
  }
  return slots;
}

export interface ExistingSlot {
  compactTime: string;
  slotName: SlotName;
  medIds: string[];
  /** Missing on slots written before daily checks existed, which is treated as none. */
  checkIds?: string[];
  critical: boolean;
}

export interface SlotChanges {
  /** Need a new schedule. */
  create: DesiredSlot[];
  /** Same time, different medicines or criticality: only the slot item changes (the workflow reads it live). */
  update: DesiredSlot[];
  /** No longer needed: delete the schedule and the slot item. */
  remove: ExistingSlot[];
}

export function diffSlots(existing: readonly ExistingSlot[], desired: readonly DesiredSlot[]): SlotChanges {
  const byTime = new Map(existing.map((s) => [s.compactTime, s]));
  const wanted = new Set(desired.map((s) => s.compactTime));
  const create: DesiredSlot[] = [];
  const update: DesiredSlot[] = [];
  for (const slot of desired) {
    const current = byTime.get(slot.compactTime);
    if (!current) create.push(slot);
    else if (current.slotName !== slot.slotName || current.critical !== slot.critical || current.medIds.join() !== slot.medIds.join() || (current.checkIds ?? []).join() !== slot.checkIds.join()) update.push(slot);
  }
  const remove = existing.filter((s) => !wanted.has(s.compactTime));
  return { create, update, remove };
}

/** Schedule names are unique per group and at most 64 characters. */
export function scheduleName(pid: string, compactTime: string): string {
  const name = `dose-${pid}-${compactTime}`;
  if (name.length > 64) throw new Error(`Schedule name too long: ${name}`);
  return name;
}

/** "0830" → EventBridge Scheduler cron firing daily at 08:30 in the schedule's timezone. */
export function dailyCron(compactTime: string): string {
  const match = /^(\d{2})(\d{2})$/.exec(compactTime);
  if (!match) throw new Error(`Invalid compact time ${compactTime}`);
  return `cron(${Number(match[2])} ${Number(match[1])} * * ? *)`;
}

/** Today's date in India as "yyyy-MM-dd". */
export function istDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const IST_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The day of the week in India, 0 = Sunday, for checks that only run on some days. */
export function istWeekday(date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(date);
  const index = IST_WEEKDAYS.indexOf(short);
  if (index < 0) throw new Error(`Unrecognised weekday "${short}"`);
  return index;
}
