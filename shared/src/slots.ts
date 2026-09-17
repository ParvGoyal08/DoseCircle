/** The four times of day a parent can be reminded. Order matters: it is the display and pattern order. */
export const SLOT_NAMES = ["morning", "afternoon", "evening", "night"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

/** Defaults every new parent starts with; the family can edit them once per parent. */
export const DEFAULT_SLOT_TIMES: Readonly<Record<SlotName, string>> = {
  morning: "08:00",
  afternoon: "13:00",
  evening: "18:00",
  night: "21:00",
};

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return HH_MM.test(value);
}

/** "08:00" → "0800", used in DynamoDB sort keys and schedule names. */
export function toCompactTime(value: string): string {
  if (!isValidTime(value)) {
    throw new Error(`Invalid time "${value}", expected HH:MM (24-hour)`);
  }
  return value.replace(":", "");
}

/** Counts per slot; null means the prescription did not say how many. */
export type SlotCounts = Partial<Record<SlotName, number | null>>;
