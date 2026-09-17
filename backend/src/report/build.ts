import {
  reportOutcome,
  summariseAdherence,
  type AdherenceSummary,
  type DoseStatus,
  type MissClass,
  type ReportOutcome,
} from "@saathi/shared";

export interface ReportDose {
  doseId: string;
  /** "yyyyMMddHHmm" in IST. */
  doseStamp: string;
  medIds: readonly string[];
  status: DoseStatus;
  missClass?: MissClass | null;
  claimedByName?: string | null;
}

export interface ReportMedicine {
  medId: string;
  nameAsPrinted: string;
  strength: string | null;
}

export interface MedicineReportRow extends AdherenceSummary {
  medId: string;
  nameAsPrinted: string;
  strength: string | null;
}

export interface MissEntry {
  doseStamp: string;
  outcome: Extract<ReportOutcome, "missed" | "unknown">;
  medicineNames: string[];
  handledBy: string | null;
}

export interface DoctorReport {
  rows: MedicineReportRow[];
  misses: MissEntry[];
  /** Day ("yyyyMMdd") → slot time ("HHmm") → outcome, for the grid. */
  grid: Record<string, Record<string, ReportOutcome>>;
}

export function buildDoctorReport(medicines: readonly ReportMedicine[], doses: readonly ReportDose[]): DoctorReport {
  const byId = new Map(medicines.map((m) => [m.medId, m]));
  const sorted = [...doses].sort((a, b) => a.doseStamp.localeCompare(b.doseStamp));

  const rows = medicines.map((medicine) => {
    const outcomes = sorted.filter((d) => d.medIds.includes(medicine.medId)).map((d) => reportOutcome(d));
    return { medId: medicine.medId, nameAsPrinted: medicine.nameAsPrinted, strength: medicine.strength, ...summariseAdherence(outcomes) };
  });

  const misses: MissEntry[] = [];
  const grid: DoctorReport["grid"] = {};
  for (const dose of sorted) {
    const outcome = reportOutcome(dose);
    const day = dose.doseStamp.slice(0, 8);
    const time = dose.doseStamp.slice(8, 12);
    grid[day] ??= {};
    grid[day][time] = outcome;
    if (outcome === "missed" || outcome === "unknown") {
      misses.push({
        doseStamp: dose.doseStamp,
        outcome,
        medicineNames: dose.medIds.map((id) => byId.get(id)?.nameAsPrinted).filter((n): n is string => Boolean(n)),
        handledBy: dose.claimedByName ?? null,
      });
    }
  }

  return { rows, misses, grid };
}
