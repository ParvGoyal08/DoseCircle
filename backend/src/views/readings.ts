import { checkDefinition, formatReading, isCheckDueAt, type CheckField, type CheckType, type PlannedCheck, type ReadingValues, type SlotName } from "@dosecircle/shared";

/**
 * Daily-check readings shaped for the dashboard and the doctor report. Pure, like the dose insights,
 * so the same code serves real families, the demo and the tests.
 *
 * Everything here is descriptive: how many readings were written down, when, and the lowest, highest
 * and middle value of the ones that were. **Nothing judges a reading.** There is no target range, no
 * "high" or "low" label and no alert: what a number means is a conversation for the parent's doctor,
 * and the report is there to make that conversation easier.
 */

export interface ReadingRow {
  checkId: string;
  type: CheckType;
  values: ReadingValues;
  at: string;
  recordedBy?: { kind: "parent" | "member"; id: string };
}

export interface ReadingSeriesPoint {
  /** "yyyy-MM-dd" in India. */
  date: string;
  at: string;
  values: ReadingValues;
  text: string;
}

export interface FieldSpread {
  key: string;
  unit: string;
  lowest: number;
  highest: number;
  middle: number;
}

export interface ReadingSeries {
  checkId: string;
  type: CheckType;
  fields: readonly CheckField[];
  chart: { primary: string; secondary?: string };
  /** Whether a forgotten reading alerts the family, so the dashboard can say when one is deliberately quiet. */
  escalates: boolean;
  /** Days the check was asked for in this period. */
  askedDays: number;
  /** Days at least one reading was written down. */
  recordedDays: number;
  points: ReadingSeriesPoint[];
  latest: ReadingSeriesPoint | null;
  /** Lowest, highest and middle value per field, over the readings that exist. */
  spread: FieldSpread[];
}

export interface ReadingsInput {
  readings: readonly ReadingRow[];
  checks: readonly PlannedCheck[];
  /** "yyyy-MM-dd" in India, inclusive. */
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

function istDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const IST_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });

/** The day of the week of an IST date, 0 = Sunday. Midday keeps it clear of the timezone offset. */
function istWeekdayOf(date: string): number {
  return WEEKDAYS.indexOf(IST_WEEKDAY.format(new Date(`${date}T12:00:00+05:30`)));
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let ms = Date.parse(`${from}T12:00:00+05:30`); ms <= Date.parse(`${to}T12:00:00+05:30`); ms += DAY_MS) {
    dates.push(istDateOf(new Date(ms).toISOString()));
  }
  return dates;
}

function middleOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One series per check the family has scheduled, oldest reading first. */
export function buildReadingSeries(input: ReadingsInput): ReadingSeries[] {
  const dates = datesBetween(input.from, input.to);
  const series: ReadingSeries[] = [];

  for (const check of input.checks) {
    const definition = checkDefinition(check.type);
    const rows = input.readings
      .filter((r) => r.checkId === check.checkId && istDateOf(r.at) >= input.from && istDateOf(r.at) <= input.to)
      .sort((a, b) => a.at.localeCompare(b.at));

    const points: ReadingSeriesPoint[] = rows.map((row) => ({
      date: istDateOf(row.at),
      at: row.at,
      values: row.values,
      text: formatReading(check.type, row.values),
    }));

    // A check asked for on Sundays only is not "missed" on a Tuesday.
    const askedDays = dates.filter((date) => check.slots.some((slot) => isCheckDueAt(check, slot as SlotName, date, istWeekdayOf(date)))).length;
    const recordedDays = new Set(points.map((p) => p.date)).size;

    const spread: FieldSpread[] = [];
    for (const field of definition.fields) {
      const numbers = points.map((p) => p.values[field.key]).filter((v): v is number => typeof v === "number");
      if (numbers.length === 0) continue;
      spread.push({ key: field.key, unit: field.unit, lowest: Math.min(...numbers), highest: Math.max(...numbers), middle: middleOf(numbers) });
    }

    series.push({
      checkId: check.checkId,
      type: check.type,
      fields: definition.fields,
      chart: definition.chart,
      escalates: check.escalates,
      askedDays,
      recordedDays,
      points,
      latest: points[points.length - 1] ?? null,
      spread,
    });
  }

  return series;
}
