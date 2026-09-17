import { CHECK_TYPES, isValidTime, LANGUAGES, SLOT_NAMES } from "@dosecircle/shared";
import { z } from "zod";

export const LanguageSchema = z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]);
export const DisplayNameSchema = z.string().trim().min(1).max(40);
export const TimeSchema = z.string().refine(isValidTime, "Use HH:MM (24-hour)");
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");
export const SlotNameSchema = z.enum(SLOT_NAMES);

const DoseCount = z.number().min(0.25).max(10);

export const MedicineFields = z.object({
  /** Exactly as printed on the strip. Never translated. */
  nameAsPrinted: z.string().trim().min(1).max(80),
  strength: z.string().trim().max(40).nullable().default(null),
  slots: z
    .object({ morning: DoseCount.optional(), afternoon: DoseCount.optional(), evening: DoseCount.optional(), night: DoseCount.optional() })
    .default({}),
  food: z.enum(["before", "after"]).nullable().default(null),
  critical: z.boolean().default(false),
  asNeeded: z.boolean().default(false),
  pillsLeft: z.number().int().min(0).max(10_000).nullable().default(null),
  refillThresholdDays: z.number().int().min(1).max(60).default(5),
  endDate: DateSchema.nullable().default(null),
});

export const MedicineInputSchema = MedicineFields.refine(
  (m) => m.asNeeded || Object.values(m.slots).some((count) => (count ?? 0) > 0),
  "Choose at least one time of day, or mark the medicine as needed only",
);

export type MedicineInput = z.infer<typeof MedicineInputSchema>;

export const CheckTypeSchema = z.enum(CHECK_TYPES);

export const CheckFields = z.object({
  type: CheckTypeSchema,
  /** The times of day the parent is asked for this measurement. */
  slots: z.array(SlotNameSchema).min(1).max(SLOT_NAMES.length),
  /** 0 = Sunday. Empty means every day. */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  /** Whether a missed check alerts the family; the default comes from the check type. */
  escalates: z.boolean().optional(),
  endDate: DateSchema.nullable().default(null),
});

export const CheckInputSchema = CheckFields.refine((c) => new Set(c.slots).size === c.slots.length, "Each time of day can appear only once").refine(
  (c) => new Set(c.weekdays).size === c.weekdays.length,
  "Each day of the week can appear only once",
);

export type CheckInput = z.infer<typeof CheckInputSchema>;

/** A measurement. Field names and limits come from the check type, so this only checks the shape. */
export const ReadingInputSchema = z.object({
  checkId: z.string().min(1).max(40),
  values: z.record(z.string().min(1).max(20), z.number()),
  /** When it was measured; defaults to now. Never in the future, never more than a day ago. */
  at: z.string().datetime().optional(),
  doseId: z.string().min(1).max(60).optional(),
});
