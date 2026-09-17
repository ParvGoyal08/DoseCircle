import { dailyUse, daysLeft, reportOutcome, type DoseStatus, type MissClass, type ReportOutcome } from "@dosecircle/shared";

/** Pure shaping of the family dashboard. Only what the screen needs; no internal ids beyond what it acts on. */

export interface DashboardDoseInput {
  doseId: string;
  pid: string;
  slotName: string;
  scheduledAt: string;
  status: DoseStatus;
  missClass?: MissClass;
  critical: boolean;
  claimedBy?: string;
  alertedMemberIds?: Iterable<string>;
}

export interface DashboardMedicineInput {
  medId: string;
  nameAsPrinted: string;
  slots: Partial<Record<string, number | null>>;
  asNeeded: boolean;
  active: boolean;
  pillsLeft: number | null;
  refillThresholdDays: number;
  needsRecount?: boolean;
}

export interface DayStrip {
  /** "yyyy-MM-dd" (IST). */
  date: string;
  outcomes: ReportOutcome[];
}

/** Last 7 days (oldest first), each with one outcome per dose in order. */
export function weekStrip(doses: readonly DashboardDoseInput[], days: readonly string[], istDateOf: (iso: string) => string): DayStrip[] {
  return days.map((date) => ({
    date,
    outcomes: doses
      .filter((d) => istDateOf(d.scheduledAt) === date)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map((d) => reportOutcome(d)),
  }));
}

export interface RefillChip {
  medId: string;
  nameAsPrinted: string;
  daysLeft: number | null;
  level: "ok" | "low" | "critical" | "recount";
}

export function refillChips(medicines: readonly DashboardMedicineInput[]): RefillChip[] {
  return medicines
    .filter((m) => m.active && !m.asNeeded && m.pillsLeft !== null)
    .map((m) => {
      const left = daysLeft(m.pillsLeft ?? 0, dailyUse({ slots: m.slots, asNeeded: m.asNeeded }));
      const level: RefillChip["level"] = m.needsRecount
        ? "recount"
        : left !== null && left <= 2
          ? "critical"
          : left !== null && left <= m.refillThresholdDays
            ? "low"
            : "ok";
      return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, daysLeft: left, level };
    })
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
}

export interface OpenAlert {
  doseId: string;
  pid: string;
  parentName: string;
  slotName: string;
  scheduledAt: string;
  status: DoseStatus;
  missClass: MissClass | null;
  critical: boolean;
  /** Whether the viewer has been alerted (and so may claim). */
  alertedMe: boolean;
  /** How far down the family order the alerts have gone. */
  alertedCount: number;
  claimedByName: string | null;
}

export function openAlerts(
  doses: readonly DashboardDoseInput[],
  viewerMid: string,
  parentNames: ReadonlyMap<string, string>,
  memberNames: ReadonlyMap<string, string>,
): OpenAlert[] {
  return doses
    .filter((d) => d.status === "ESCALATING" || d.status === "CLAIMED")
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.scheduledAt.localeCompare(a.scheduledAt))
    .map((d) => ({
      doseId: d.doseId,
      pid: d.pid,
      parentName: parentNames.get(d.pid) ?? "",
      slotName: d.slotName,
      scheduledAt: d.scheduledAt,
      status: d.status,
      missClass: d.missClass ?? null,
      critical: d.critical,
      alertedMe: new Set(d.alertedMemberIds ?? []).has(viewerMid),
      alertedCount: new Set(d.alertedMemberIds ?? []).size,
      claimedByName: d.claimedBy ? (memberNames.get(d.claimedBy) ?? null) : null,
    }));
}

/** 1-based position in the escalation order, or null if not in it. */
export function ladderPosition(ladder: readonly string[], mid: string): number | null {
  const index = ladder.indexOf(mid);
  return index === -1 ? null : index + 1;
}
