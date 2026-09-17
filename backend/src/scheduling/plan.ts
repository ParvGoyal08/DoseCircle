import { SLOT_NAMES, toCompactTime, type SlotName } from "@dosecircle/shared";

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
  critical: boolean;
}

/** One reminder per time of day, grouping every medicine due then. Critical if any of them is. */
export function desiredSlots(
  medicines: readonly PlannedMedicine[],
  slotTimes: Readonly<Record<SlotName, string>>,
  todayIst: string,
): DesiredSlot[] {
  const slots: DesiredSlot[] = [];
  for (const slotName of SLOT_NAMES) {
    const due = medicines.filter(
      (m) => m.active && !m.asNeeded && (!m.endDate || m.endDate >= todayIst) && (m.slots[slotName] ?? 0) > 0,
    );
    if (due.length === 0) continue;
    slots.push({
      compactTime: toCompactTime(slotTimes[slotName]),
      slotName,
      medIds: due.map((m) => m.medId).sort(),
      critical: due.some((m) => m.critical),
    });
  }
  return slots;
}

export interface ExistingSlot {
  compactTime: string;
  slotName: SlotName;
  medIds: string[];
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
    else if (current.slotName !== slot.slotName || current.critical !== slot.critical || current.medIds.join() !== slot.medIds.join()) update.push(slot);
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
