import { isValidTime, LANGUAGES, SLOT_NAMES } from "@dosecircle/shared";
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
