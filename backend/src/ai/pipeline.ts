import type { ApplyGuardrailCommandInput, ApplyGuardrailCommandOutput, ConverseCommandInput, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import type { Block } from "@aws-sdk/client-textract";
import type { PrescriptionRow } from "../lib/model.js";
import { buildConverseInput, ExtractionFormatError, parseConverseOutput } from "./converse.js";
import { isUnreadable, reviewRow } from "./review.js";
import type { PrescriptionExtraction } from "./schema.js";
import { linesFromBlocks, type OcrLineWithBox } from "./textract.js";

/** The AWS calls the pipeline makes, injected so the whole flow can be tested without AWS. */
export interface ExtractionPorts {
  detectText(): Promise<Block[]>;
  modelImage(): Promise<Uint8Array | null>;
  converse(input: ConverseCommandInput): Promise<Pick<ConverseCommandOutput, "output" | "stopReason">>;
  applyGuardrail(input: Pick<ApplyGuardrailCommandInput, "content">): Promise<Pick<ApplyGuardrailCommandOutput, "action">>;
}

export type ExtractionResult =
  | { ok: true; lines: OcrLineWithBox[]; rows: PrescriptionRow[]; guardrailInterventions: number }
  | { ok: false; failure: "unreadable" | "upload_incomplete" | "no_medicines"; lines: OcrLineWithBox[] };

/**
 * Textract reads the lines (in Mumbai) → Claude reads the photo and those lines and only transcribes →
 * the notation table decides the schedule → the guardrail screens the model's free-text notes.
 * Nothing here saves a medicine: every row still has to be confirmed by a person.
 */
export async function runExtraction(modelId: string, ports: ExtractionPorts): Promise<ExtractionResult> {
  const lines = linesFromBlocks(await ports.detectText());
  if (isUnreadable(lines)) return { ok: false, failure: "unreadable", lines };

  const image = await ports.modelImage();
  if (!image) return { ok: false, failure: "upload_incomplete", lines };

  const request = buildConverseInput({ modelId, image, lines });
  let extraction: PrescriptionExtraction;
  try {
    extraction = parseConverseOutput(await ports.converse(request), lines);
  } catch (error) {
    if (!(error instanceof ExtractionFormatError)) throw error;
    // One retry for a malformed tool call; a second failure is a real error.
    extraction = parseConverseOutput(await ports.converse(request), lines);
  }
  if (extraction.medicines.length === 0) return { ok: false, failure: "no_medicines", lines };

  let guardrailInterventions = 0;
  const medicines = await Promise.all(
    extraction.medicines.map(async (medicine) => {
      if (!medicine.notesEnglish) return medicine;
      // Only the model's own English notes are screened. Transcribed names and doses are shown as read,
      // because blocking them would hide exactly what the family needs to check.
      const result = await ports.applyGuardrail({ content: [{ text: { text: medicine.notesEnglish } }] });
      if (result.action === "GUARDRAIL_INTERVENED") {
        guardrailInterventions++;
        return { ...medicine, notesEnglish: null };
      }
      return medicine;
    }),
  );

  const rows = medicines.map((medicine, index) => ({ rowId: `r${index + 1}`, ...reviewRow(medicine, lines) }));
  return { ok: true, lines, rows, guardrailInterventions };
}
