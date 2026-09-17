import { interpretNotation, type NotationResult } from "@saathi/shared";
import type { ExtractedMedicine } from "./schema.js";

export interface OcrLine {
  id: string;
  text: string;
  /** Textract confidence, 0–100. */
  confidence: number;
  handwriting: boolean;
}

export type ReviewLevel = "red" | "amber" | "green";

export interface ReviewRow {
  medicine: ExtractedMedicine;
  schedule: NotationResult;
  level: ReviewLevel;
  reasons: string[];
}

/** Below this Textract confidence a line is always shown in amber. */
export const LOW_OCR_CONFIDENCE = 85;

/**
 * Decides how prominently a row asks for checking. Every row still needs explicit human
 * confirmation before saving — green only means "nothing looked wrong", never "verified".
 */
export function reviewRow(medicine: ExtractedMedicine, lines: readonly OcrLine[]): ReviewRow {
  const schedule = interpretNotation(medicine);
  const reasons: string[] = [];

  if (!medicine.drugAsWritten) reasons.push("name_missing");
  if (!schedule.asNeeded && Object.keys(schedule.slots).length === 0) reasons.push("schedule_missing");
  const red = reasons.length > 0;

  const referenced = lines.filter((line) => medicine.lineRefs.includes(line.id));
  if (referenced.length === 0) reasons.push("no_source_line");
  if (referenced.some((line) => line.confidence < LOW_OCR_CONFIDENCE)) reasons.push("low_ocr_confidence");
  if (referenced.some((line) => line.handwriting)) reasons.push("handwritten");
  if (!medicine.legible) reasons.push("marked_illegible");
  if (medicine.uncertainFields.length > 0) reasons.push("uncertain_fields");
  if (!medicine.strength) reasons.push("strength_missing");
  reasons.push(...schedule.unresolved);

  const level: ReviewLevel = red ? "red" : reasons.length > 0 ? "amber" : "green";
  return { medicine, schedule, level, reasons };
}

/** The extraction fails outright (offer the manual form) when there is too little readable text. */
export function isUnreadable(lines: readonly OcrLine[]): boolean {
  if (lines.length < 2) return true;
  const mean = lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length;
  return mean < 50;
}
