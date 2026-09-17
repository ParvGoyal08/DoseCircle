import { reviewRow } from "../ai/review.js";
import type { ExtractedMedicine } from "../ai/schema.js";
import type { OcrLineWithBox } from "../ai/textract.js";
import type { PrescriptionRow } from "../lib/model.js";

/**
 * A fictional printed prescription (web/public/demo/sample-prescription.svg) and the extraction for it.
 * Boxes are ratios of the 1000×1300 image, matching the SVG layout, so highlights line up exactly.
 * The doctor, clinic and registration number are invented.
 */
const Y = (top: number) => top / 1300;
const box = (left: number, top: number, width: number) => ({ left: left / 1000, top: Y(top), width: width / 1000, height: 44 / 1300 });

export const SAMPLE_LINES: OcrLineWithBox[] = [
  { id: "L1", text: "Dr. Kavya Rao, MBBS, MD (General Medicine)", confidence: 99.2, handwriting: false, box: box(80, 70, 760) },
  { id: "L2", text: "Sample Clinic, Mysuru · Reg. No. SAMPLE-0000", confidence: 98.1, handwriting: false, box: box(80, 125, 700) },
  { id: "L3", text: "Name: Shantha   Age/Sex: 68/F   Date: 12/09/2026", confidence: 97.6, handwriting: false, box: box(80, 250, 840) },
  { id: "L4", text: "1. Tab. Glycomet GP 1      1-0-1      PC      x 30 days", confidence: 96.8, handwriting: false, box: box(110, 430, 820) },
  { id: "L5", text: "2. Tab. Telma 40      1-0-0      x 30 days", confidence: 97.3, handwriting: false, box: box(110, 530, 700) },
  { id: "L6", text: "3. Inj. Lantus 10 units HS", confidence: 71.4, handwriting: true, box: box(110, 630, 560) },
  { id: "L7", text: "4. Tab. Dolo 650      SOS", confidence: 95.9, handwriting: false, box: box(110, 730, 520) },
  { id: "L8", text: "Review after one month", confidence: 98.4, handwriting: false, box: box(80, 900, 420) },
];

const extracted: ExtractedMedicine[] = [
  {
    lineRefs: ["L4"],
    drugAsWritten: "Glycomet GP 1",
    strength: null,
    dosePatternAsWritten: "1-0-1",
    frequencyCodeAsWritten: null,
    foodCodeAsWritten: "PC",
    durationAsWritten: "x 30 days",
    legible: true,
    uncertainFields: [],
    notesEnglish: null,
  },
  {
    lineRefs: ["L5"],
    drugAsWritten: "Telma",
    strength: "40",
    dosePatternAsWritten: "1-0-0",
    frequencyCodeAsWritten: null,
    foodCodeAsWritten: null,
    durationAsWritten: "x 30 days",
    legible: true,
    uncertainFields: [],
    notesEnglish: null,
  },
  {
    lineRefs: ["L6"],
    drugAsWritten: "Lantus",
    strength: "10 units",
    dosePatternAsWritten: null,
    frequencyCodeAsWritten: "HS",
    foodCodeAsWritten: null,
    durationAsWritten: null,
    legible: true,
    uncertainFields: ["strength"],
    notesEnglish: "This line is handwritten; the number of units is faint.",
  },
  {
    lineRefs: ["L7"],
    drugAsWritten: "Dolo",
    strength: "650",
    dosePatternAsWritten: null,
    frequencyCodeAsWritten: "SOS",
    foodCodeAsWritten: null,
    durationAsWritten: null,
    legible: true,
    uncertainFields: [],
    notesEnglish: null,
  },
];

export function samplePrescription(): { imagePath: string; lines: OcrLineWithBox[]; rows: PrescriptionRow[] } {
  return {
    imagePath: "/demo/sample-prescription.svg",
    lines: SAMPLE_LINES,
    rows: extracted.map((medicine, index) => ({ rowId: `r${index + 1}`, ...reviewRow(medicine, SAMPLE_LINES) })),
  };
}
