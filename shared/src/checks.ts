import type { SlotName } from "./slots.js";

/**
 * Daily checks a family can ask a parent to do at a time of day: blood sugar, blood pressure, weight,
 * oxygen or temperature. They ride on the same reminder times as medicines.
 *
 * DoseCircle records what was measured and never interprets it: there are no "normal" ranges here, and
 * nothing in the app tells anyone what a reading means. The wide limits below only catch typing mistakes
 * (a weight of 700, a systolic of 20), so a slip does not end up in the doctor's report.
 */

export const CHECK_TYPES = ["glucose", "bp", "weight", "spo2", "temperature"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export interface CheckField {
  /** Stored on the reading, e.g. "systolic". */
  key: string;
  unit: string;
  /** Plainly impossible values are refused, so a typo never reaches the report. */
  min: number;
  max: number;
  /** Decimal places to keep and show. */
  decimals: 0 | 1;
  /** A reading can be recorded without this field (for example the pulse on a BP monitor). */
  optional?: boolean;
}

export interface CheckDefinition {
  type: CheckType;
  fields: readonly CheckField[];
  /** Whether a missed check alerts the family by default: yes for the two that a doctor acts on. */
  escalatesByDefault: boolean;
  /** Which field a trend chart plots, and the second line where there is one. */
  chart: { primary: string; secondary?: string };
}

export const CHECK_DEFINITIONS: Readonly<Record<CheckType, CheckDefinition>> = {
  glucose: {
    type: "glucose",
    fields: [{ key: "glucose", unit: "mg/dL", min: 20, max: 700, decimals: 0 }],
    escalatesByDefault: true,
    chart: { primary: "glucose" },
  },
  bp: {
    type: "bp",
    fields: [
      { key: "systolic", unit: "mmHg", min: 50, max: 300, decimals: 0 },
      { key: "diastolic", unit: "mmHg", min: 20, max: 200, decimals: 0 },
      { key: "pulse", unit: "bpm", min: 25, max: 250, decimals: 0, optional: true },
    ],
    escalatesByDefault: true,
    chart: { primary: "systolic", secondary: "diastolic" },
  },
  weight: {
    type: "weight",
    fields: [{ key: "weight", unit: "kg", min: 15, max: 350, decimals: 1 }],
    escalatesByDefault: false,
    chart: { primary: "weight" },
  },
  spo2: {
    type: "spo2",
    fields: [{ key: "spo2", unit: "%", min: 50, max: 100, decimals: 0 }],
    escalatesByDefault: false,
    chart: { primary: "spo2" },
  },
  temperature: {
    type: "temperature",
    fields: [{ key: "temperature", unit: "°C", min: 30, max: 45, decimals: 1 }],
    escalatesByDefault: false,
    chart: { primary: "temperature" },
  },
};

export function checkDefinition(type: CheckType): CheckDefinition {
  return CHECK_DEFINITIONS[type];
}

export function isCheckType(value: string): value is CheckType {
  return (CHECK_TYPES as readonly string[]).includes(value);
}

export type ReadingValues = Partial<Record<string, number>>;

export type ReadingProblem = { field: string; reason: "missing" | "out_of_range" | "unknown_field" };

/**
 * Checks a reading against its definition. Every required field must be present and within the wide
 * limits above; unknown fields are refused so the report only ever holds fields we can label.
 */
export function validateReading(type: CheckType, values: ReadingValues): ReadingProblem[] {
  const definition = checkDefinition(type);
  const problems: ReadingProblem[] = [];
  for (const field of definition.fields) {
    const value = values[field.key];
    if (value === undefined || value === null) {
      if (!field.optional) problems.push({ field: field.key, reason: "missing" });
      continue;
    }
    if (!Number.isFinite(value) || value < field.min || value > field.max) problems.push({ field: field.key, reason: "out_of_range" });
  }
  for (const key of Object.keys(values)) {
    if (!definition.fields.some((field) => field.key === key)) problems.push({ field: key, reason: "unknown_field" });
  }
  return problems;
}

/** Keeps the decimals each field is measured to, so 70.25 kg is stored as 70.3. */
export function roundReading(type: CheckType, values: ReadingValues): ReadingValues {
  const rounded: ReadingValues = {};
  for (const field of checkDefinition(type).fields) {
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    const factor = field.decimals === 1 ? 10 : 1;
    rounded[field.key] = Math.round(value * factor) / factor;
  }
  return rounded;
}

/** How a reading reads on one line, e.g. "128/82 mmHg" or "112 mg/dL". Never translated. */
export function formatReading(type: CheckType, values: ReadingValues): string {
  const definition = checkDefinition(type);
  if (type === "bp") {
    const { systolic, diastolic } = values;
    return systolic !== undefined && diastolic !== undefined ? `${systolic}/${diastolic} mmHg` : "";
  }
  const field = definition.fields[0]!;
  const value = values[field.key];
  return value === undefined ? "" : `${value} ${field.unit}`;
}

export interface PlannedCheck {
  checkId: string;
  type: CheckType;
  slots: readonly SlotName[];
  /** Days of the week it is asked for, 0 = Sunday. Empty means every day. */
  weekdays?: readonly number[];
  /** Whether a missed check alerts the family. */
  escalates: boolean;
  active: boolean;
  /** "yyyy-MM-dd"; the check stops after this day. */
  endDate?: string;
}

/** Whether a check should be asked for at this time of day, on this date. */
export function isCheckDueAt(check: PlannedCheck, slotName: SlotName, todayIst: string, weekday: number): boolean {
  if (!check.active || !check.slots.includes(slotName)) return false;
  if (check.endDate && check.endDate < todayIst) return false;
  return !check.weekdays || check.weekdays.length === 0 || check.weekdays.includes(weekday);
}
