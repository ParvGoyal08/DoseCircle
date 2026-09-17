import { SLOT_NAMES, type SlotCounts, type SlotName } from "./slots.js";

/**
 * Deterministic mapping of Indian prescription shorthand to a schedule.
 *
 * The model only transcribes what is written. This table — never the model — decides what the
 * shorthand means, so the same input always produces the same schedule and can be unit tested.
 * Anything not recognised is reported in `unresolved` and shown to the family in amber.
 */

export type FoodTiming = "before" | "after";

export interface NotationInput {
  dosePatternAsWritten?: string | null;
  frequencyCodeAsWritten?: string | null;
  foodCodeAsWritten?: string | null;
  durationAsWritten?: string | null;
}

export type UnresolvedReason =
  | "pattern_unreadable"
  | "frequency_unknown"
  | "frequency_not_daily"
  | "pattern_frequency_conflict"
  | "amount_not_written"
  | "food_unknown"
  | "duration_unknown"
  | "duration_month_approximate"
  | "no_schedule_found";

export interface NotationResult {
  slots: SlotCounts;
  asNeeded: boolean;
  food: FoodTiming | null;
  durationDays: number | null;
  unresolved: UnresolvedReason[];
}

const THREE_PART_SLOTS: readonly SlotName[] = ["morning", "afternoon", "night"];

function parseAmount(raw: string): number | null {
  const value = raw.trim().replace(/\s+/g, "");
  if (value === "½" || value === "1/2") return 0.5;
  if (value === "¼" || value === "1/4") return 0.25;
  if (value === "1½" || value === "11/2") return 1.5;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

/** "1-0-1", "1 - 0 - 1", "1–0–1", "½-0-½", "1-1-1-1". Returns null if it is not a pattern. */
export function parseDosePattern(raw: string): SlotCounts | null {
  const parts = raw.trim().split(/\s*[-–—]\s*/);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const amounts = parts.map(parseAmount);
  if (amounts.some((a) => a === null)) return null;

  const slotOrder = parts.length === 3 ? THREE_PART_SLOTS : SLOT_NAMES;
  const slots: SlotCounts = {};
  amounts.forEach((amount, index) => {
    const slot = slotOrder[index];
    if (slot && amount !== null && amount > 0) slots[slot] = amount;
  });
  return slots;
}

type FrequencyMeaning =
  | { kind: "daily"; slots: readonly SlotName[] }
  | { kind: "as_needed" }
  | { kind: "not_daily" };

const FREQUENCY_CODES: Readonly<Record<string, FrequencyMeaning>> = {
  OD: { kind: "daily", slots: ["morning"] },
  QD: { kind: "daily", slots: ["morning"] },
  BD: { kind: "daily", slots: ["morning", "night"] },
  BID: { kind: "daily", slots: ["morning", "night"] },
  TDS: { kind: "daily", slots: ["morning", "afternoon", "night"] },
  TID: { kind: "daily", slots: ["morning", "afternoon", "night"] },
  QID: { kind: "daily", slots: ["morning", "afternoon", "evening", "night"] },
  QDS: { kind: "daily", slots: ["morning", "afternoon", "evening", "night"] },
  HS: { kind: "daily", slots: ["night"] },
  SOS: { kind: "as_needed" },
  PRN: { kind: "as_needed" },
  STAT: { kind: "not_daily" },
  EOD: { kind: "not_daily" },
  AD: { kind: "not_daily" },
  OW: { kind: "not_daily" },
};

function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

export function parseFrequencyCode(raw: string): FrequencyMeaning | null {
  return FREQUENCY_CODES[normaliseCode(raw)] ?? null;
}

export function parseFoodCode(raw: string): FoodTiming | null {
  const code = normaliseCode(raw);
  if (code === "AC" || code === "BEFOREFOOD" || code === "BEFOREMEAL" || code === "BEFOREMEALS" || code === "EMPTYSTOMACH") {
    return "before";
  }
  if (code === "PC" || code === "AFTERFOOD" || code === "AFTERMEAL" || code === "AFTERMEALS") {
    return "after";
  }
  return null;
}

export function parseDuration(raw: string): { days: number | null; approximate: boolean; recognised: boolean } {
  const text = raw.toLowerCase().trim();
  if (/\b(cont|continue|contd|ongoing|long\s*term)\b/.test(text)) {
    return { days: null, approximate: false, recognised: true };
  }
  // Indian clinical shorthand: "5/7" = 5 days, "2/52" = 2 weeks, "1/12" = 1 month.
  const fraction = text.match(/(\d+)\s*\/\s*(7|52|12)\b/);
  if (fraction?.[1] && fraction[2]) {
    const n = Number(fraction[1]);
    if (fraction[2] === "7") return { days: n, approximate: false, recognised: true };
    if (fraction[2] === "52") return { days: n * 7, approximate: false, recognised: true };
    return { days: n * 30, approximate: true, recognised: true };
  }
  const match = text.match(/(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|month|months)\b/);
  if (!match || !match[1] || !match[2]) return { days: null, approximate: false, recognised: false };
  const n = Number(match[1]);
  const unit = match[2];
  if (unit.startsWith("d")) return { days: n, approximate: false, recognised: true };
  if (unit.startsWith("w")) return { days: n * 7, approximate: false, recognised: true };
  return { days: n * 30, approximate: true, recognised: true };
}

function sameSlots(a: readonly SlotName[], b: readonly SlotName[]): boolean {
  return a.length === b.length && a.every((slot) => b.includes(slot));
}

export function interpretNotation(input: NotationInput): NotationResult {
  const unresolved: UnresolvedReason[] = [];
  let slots: SlotCounts = {};
  let asNeeded = false;

  const pattern = input.dosePatternAsWritten?.trim() || null;
  const frequency = input.frequencyCodeAsWritten?.trim() || null;

  const patternSlots = pattern ? parseDosePattern(pattern) : null;
  if (pattern && !patternSlots) unresolved.push("pattern_unreadable");

  const frequencyMeaning = frequency ? parseFrequencyCode(frequency) : null;
  if (frequency && !frequencyMeaning) unresolved.push("frequency_unknown");

  if (frequencyMeaning?.kind === "as_needed") {
    asNeeded = true;
  } else if (frequencyMeaning?.kind === "not_daily") {
    unresolved.push("frequency_not_daily");
  }

  if (patternSlots) {
    slots = patternSlots;
    if (frequencyMeaning?.kind === "daily") {
      const fromPattern = Object.keys(patternSlots) as SlotName[];
      if (!sameSlots(fromPattern, frequencyMeaning.slots)) unresolved.push("pattern_frequency_conflict");
    }
  } else if (frequencyMeaning?.kind === "daily") {
    // The code says when, but not how many: never assume an amount.
    for (const slot of frequencyMeaning.slots) slots[slot] = null;
    unresolved.push("amount_not_written");
  }

  if (!asNeeded && Object.keys(slots).length === 0 && !unresolved.includes("frequency_not_daily")) {
    unresolved.push("no_schedule_found");
  }

  let food: FoodTiming | null = null;
  const foodRaw = input.foodCodeAsWritten?.trim() || null;
  if (foodRaw) {
    food = parseFoodCode(foodRaw);
    if (!food) unresolved.push("food_unknown");
  }

  let durationDays: number | null = null;
  const durationRaw = input.durationAsWritten?.trim() || null;
  if (durationRaw) {
    const duration = parseDuration(durationRaw);
    if (!duration.recognised) unresolved.push("duration_unknown");
    if (duration.approximate) unresolved.push("duration_month_approximate");
    durationDays = duration.days;
  }

  return { slots, asNeeded, food, durationDays, unresolved };
}
