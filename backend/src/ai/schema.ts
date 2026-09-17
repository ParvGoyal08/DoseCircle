import { z } from "zod";

/**
 * What the model returns for each medicine line. It transcribes only; the meaning of shorthand is
 * decided later by @dosecircle/shared interpretNotation, never by the model.
 */
export const ExtractedMedicineSchema = z.object({
  lineRefs: z.array(z.string()).describe("Ids of the OCR lines this medicine was read from, e.g. [\"L3\",\"L4\"]"),
  drugAsWritten: z.string().nullable().describe("Medicine name exactly as written. Null if not legible. Never guess."),
  strength: z.string().nullable().describe("Strength exactly as written, e.g. \"500 mg\", or null"),
  dosePatternAsWritten: z.string().nullable().describe("Pattern like \"1-0-1\" exactly as written, or null"),
  frequencyCodeAsWritten: z.string().nullable().describe("Frequency code like OD, BD, TDS, HS, SOS exactly as written, or null"),
  foodCodeAsWritten: z.string().nullable().describe("Food timing like AC, PC, \"after food\" exactly as written, or null"),
  durationAsWritten: z.string().nullable().describe("Duration like \"x 5 days\" or \"5/7\" exactly as written, or null"),
  legible: z.boolean().describe("False if any part of this line could not be read with confidence"),
  uncertainFields: z
    .array(z.enum(["drugAsWritten", "strength", "dosePatternAsWritten", "frequencyCodeAsWritten", "foodCodeAsWritten", "durationAsWritten"]))
    .describe("Fields you are not sure you read correctly"),
  notesEnglish: z.string().nullable().describe("Short English note about what was unclear, or null. Never give medical advice."),
});

export const PrescriptionExtractionSchema = z.object({
  medicines: z.array(ExtractedMedicineSchema),
  unreadableLineRefs: z.array(z.string()).describe("OCR line ids that look like medicine lines but could not be read"),
});

export type ExtractedMedicine = z.infer<typeof ExtractedMedicineSchema>;
export type PrescriptionExtraction = z.infer<typeof PrescriptionExtractionSchema>;

export const EXTRACTION_TOOL_NAME = "record_prescription";

/** JSON Schema for the Bedrock Converse tool definition, generated from the same zod schema. */
export function extractionToolInputSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(PrescriptionExtractionSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
