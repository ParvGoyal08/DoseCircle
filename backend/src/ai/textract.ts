import type { Block } from "@aws-sdk/client-textract";
import type { OcrLine } from "./review.js";

export interface OcrLineWithBox extends OcrLine {
  /** Ratios of the image size (0–1), as Textract returns them, so the app can draw highlights at any size. */
  box: { left: number; top: number; width: number; height: number } | null;
}

/** Turns DetectDocumentText blocks into numbered lines (L1, L2, …) in reading order. */
export function linesFromBlocks(blocks: readonly Block[]): OcrLineWithBox[] {
  const words = new Map(blocks.filter((b) => b.BlockType === "WORD" && b.Id).map((b) => [b.Id!, b]));
  return blocks
    .filter((b) => b.BlockType === "LINE" && b.Text?.trim())
    .map((line, index) => {
      const childIds = (line.Relationships ?? []).filter((r) => r.Type === "CHILD").flatMap((r) => r.Ids ?? []);
      const box = line.Geometry?.BoundingBox;
      return {
        id: `L${index + 1}`,
        text: line.Text!.trim(),
        confidence: Math.round((line.Confidence ?? 0) * 10) / 10,
        handwriting: childIds.some((id) => words.get(id)?.TextType === "HANDWRITING"),
        box: box ? { left: box.Left ?? 0, top: box.Top ?? 0, width: box.Width ?? 0, height: box.Height ?? 0 } : null,
      };
    });
}
