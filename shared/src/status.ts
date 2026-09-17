export const DOSE_STATUSES = [
  "PENDING",
  "TAKEN",
  "TAKEN_LATE",
  "ESCALATING",
  "CLAIMED",
  "UNRESOLVED",
  "SKIPPED",
] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

/** Why a dose escalated: the reminder reached the phone (MISSED) or never did (OFFLINE). */
export type MissClass = "MISSED" | "OFFLINE";

/** A parent can confirm while waiting, during escalation, or after a family member has called. */
export const TAKEN_ALLOWED_FROM: readonly DoseStatus[] = ["PENDING", "ESCALATING", "CLAIMED"];

/** Only an escalating dose can be claimed; the conditional write enforces this server-side too. */
export const CLAIM_ALLOWED_FROM: readonly DoseStatus[] = ["ESCALATING"];

export function canMarkTaken(status: DoseStatus): boolean {
  return TAKEN_ALLOWED_FROM.includes(status);
}

export function canClaim(status: DoseStatus): boolean {
  return CLAIM_ALLOWED_FROM.includes(status);
}

/** On time only if confirmed before escalation started. */
export function takenStatusFor(previous: DoseStatus): "TAKEN" | "TAKEN_LATE" {
  return previous === "PENDING" ? "TAKEN" : "TAKEN_LATE";
}

export type ReportOutcome = "on_time" | "late" | "missed" | "unknown" | "excluded" | "open";

/**
 * How a dose appears in the doctor report.
 * An offline phone is never counted as a missed dose: we genuinely do not know.
 */
export function reportOutcome(dose: { status: DoseStatus; missClass?: MissClass | null }): ReportOutcome {
  switch (dose.status) {
    case "TAKEN":
      return "on_time";
    case "TAKEN_LATE":
      return "late";
    case "SKIPPED":
      return "excluded";
    case "PENDING":
    case "ESCALATING":
      return "open";
    case "CLAIMED":
    case "UNRESOLVED":
      return dose.missClass === "OFFLINE" ? "unknown" : "missed";
  }
}

export interface AdherenceSummary {
  onTime: number;
  late: number;
  missed: number;
  unknown: number;
  /** Taken ÷ (taken + missed). Unknown, open and excluded doses are left out. Null when nothing counts. */
  adherence: number | null;
}

export function summariseAdherence(outcomes: readonly ReportOutcome[]): AdherenceSummary {
  const count = (outcome: ReportOutcome) => outcomes.filter((o) => o === outcome).length;
  const onTime = count("on_time");
  const late = count("late");
  const missed = count("missed");
  const unknown = count("unknown");
  const counted = onTime + late + missed;
  return {
    onTime,
    late,
    missed,
    unknown,
    adherence: counted === 0 ? null : (onTime + late) / counted,
  };
}
