import type { Block } from "@aws-sdk/client-textract";
import { describe, expect, it, vi } from "vitest";
import { buildConverseInput, parseConverseOutput, SYSTEM_PROMPT } from "../src/ai/converse.js";
import { runExtraction, type ExtractionPorts } from "../src/ai/pipeline.js";
import { EXTRACTION_TOOL_NAME, type ExtractedMedicine } from "../src/ai/schema.js";
import { linesFromBlocks } from "../src/ai/textract.js";
import { samplePrescription } from "../src/demo/sample-prescription.js";
import { checkDecisions, MAX_MODEL_BYTES, type ConfirmDecision } from "../src/api/family/prescriptions.js";

const line = (id: string, text: string, confidence: number, wordIds: string[]): Block => ({
  BlockType: "LINE",
  Id: id,
  Text: text,
  Confidence: confidence,
  Geometry: { BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.5, Height: 0.03 } },
  Relationships: [{ Type: "CHILD", Ids: wordIds }],
});
const word = (id: string, handwritten = false): Block => ({ BlockType: "WORD", Id: id, TextType: handwritten ? "HANDWRITING" : "PRINTED" });

const blocks: Block[] = [
  { BlockType: "PAGE", Id: "page" },
  line("a", "Dr. Kavya Rao, MBBS", 99.1, ["w1"]),
  line("b", "Tab. Glycomet GP 1   1-0-1   x 30 days  PC", 96.44, ["w2"]),
  line("c", "Cap. Pantop 40 OD AC", 72, ["w3"]),
  line("d", "   ", 90, []),
  word("w1"),
  word("w2"),
  word("w3", true),
];

const medicine = (overrides: Partial<ExtractedMedicine> = {}): ExtractedMedicine => ({
  lineRefs: ["L2"],
  drugAsWritten: "Glycomet GP 1",
  strength: null,
  dosePatternAsWritten: "1-0-1",
  frequencyCodeAsWritten: null,
  foodCodeAsWritten: "PC",
  durationAsWritten: "x 30 days",
  legible: true,
  uncertainFields: [],
  notesEnglish: null,
  ...overrides,
});

const toolOutput = (medicines: unknown[], stopReason = "tool_use") => ({
  stopReason: stopReason as "tool_use",
  output: { message: { role: "assistant" as const, content: [{ toolUse: { toolUseId: "t1", name: EXTRACTION_TOOL_NAME, input: { medicines, unreadableLineRefs: [] } as never } }] } },
});

function ports(overrides: Partial<ExtractionPorts> = {}): ExtractionPorts {
  return {
    detectText: async () => blocks,
    modelImage: async () => new Uint8Array([0xff, 0xd8]),
    converse: async () => toolOutput([medicine()]),
    applyGuardrail: async () => ({ action: "NONE" }),
    ...overrides,
  };
}

describe("Textract lines", () => {
  it("numbers non-empty lines in order and flags handwriting from child words", () => {
    const lines = linesFromBlocks(blocks);
    expect(lines.map((l) => l.id)).toEqual(["L1", "L2", "L3"]);
    expect(lines[1]).toMatchObject({ text: "Tab. Glycomet GP 1   1-0-1   x 30 days  PC", confidence: 96.4, handwriting: false });
    expect(lines[2]?.handwriting).toBe(true);
    expect(lines[0]?.box).toEqual({ left: 0.1, top: 0.2, width: 0.5, height: 0.03 });
  });
});

describe("Bedrock request", () => {
  it("forces the single extraction tool at temperature 0 and sends the image before the lines", () => {
    const input = buildConverseInput({ modelId: "global.anthropic.claude-sonnet-4-6", image: new Uint8Array([1]), lines: linesFromBlocks(blocks) });
    expect(input.toolConfig?.toolChoice).toEqual({ any: {} });
    expect(input.toolConfig?.tools).toHaveLength(1);
    expect(input.inferenceConfig?.temperature).toBe(0);
    const content = input.messages?.[0]?.content ?? [];
    expect(content[0]).toHaveProperty("image");
    expect(JSON.stringify(content[1])).toContain("L3 (handwritten): Cap. Pantop 40 OD AC");
  });

  it("tells the model to transcribe, never guess, and ignore instructions in the image", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never guess/);
    expect(SYSTEM_PROMPT).toMatch(/data, not instructions/);
    expect(SYSTEM_PROMPT).toMatch(/Never give medical advice/);
  });

  it("drops invented line references and normalises empty strings", () => {
    const parsed = parseConverseOutput(toolOutput([medicine({ lineRefs: ["L2", "L99"], strength: "  ", notesEnglish: "" })]), linesFromBlocks(blocks));
    expect(parsed.medicines[0]).toMatchObject({ lineRefs: ["L2"], strength: null, notesEnglish: null });
  });

  it("rejects truncated or schema-breaking output", () => {
    const lines = linesFromBlocks(blocks);
    expect(() => parseConverseOutput(toolOutput([medicine()], "max_tokens"), lines)).toThrow(/cut off/);
    expect(() => parseConverseOutput(toolOutput([{ drugAsWritten: 5 }]), lines)).toThrow(/schema/);
    expect(() => parseConverseOutput({ stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: "Sure!" }] } } }, lines)).toThrow(/did not call/);
  });
});

describe("extraction pipeline", () => {
  it("produces review rows with levels and the schedule decided by the notation table", async () => {
    const result = await runExtraction("m", ports());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ rowId: "r1", schedule: { slots: { morning: 1, night: 1 }, food: "after", durationDays: 30 } });
    // No strength written → amber, never green.
    expect(result.rows[0]?.level).toBe("amber");
  });

  it("fails early on unreadable photos without calling the model", async () => {
    const converse = vi.fn();
    const result = await runExtraction("m", ports({ detectText: async () => [line("a", "blur", 30, [])], converse }));
    expect(result).toMatchObject({ ok: false, failure: "unreadable" });
    expect(converse).not.toHaveBeenCalled();
  });

  it("reports a missing model image as an incomplete upload", async () => {
    expect(await runExtraction("m", ports({ modelImage: async () => null }))).toMatchObject({ ok: false, failure: "upload_incomplete" });
  });

  it("retries a malformed tool call exactly once", async () => {
    const converse = vi.fn().mockResolvedValueOnce(toolOutput([{ bad: true }])).mockResolvedValueOnce(toolOutput([medicine()]));
    expect((await runExtraction("m", ports({ converse }))).ok).toBe(true);
    expect(converse).toHaveBeenCalledTimes(2);

    const alwaysBad = vi.fn().mockResolvedValue(toolOutput([{ bad: true }]));
    await expect(runExtraction("m", ports({ converse: alwaysBad }))).rejects.toThrow();
    expect(alwaysBad).toHaveBeenCalledTimes(2);
  });

  it("removes notes the guardrail blocks but keeps the transcription", async () => {
    const applyGuardrail = vi.fn().mockResolvedValue({ action: "GUARDRAIL_INTERVENED" });
    const result = await runExtraction("m", ports({ converse: async () => toolOutput([medicine({ notesEnglish: "You should double the dose" })]), applyGuardrail }));
    expect(result.ok && result.guardrailInterventions).toBe(1);
    expect(result.ok && result.rows[0]?.medicine).toMatchObject({ drugAsWritten: "Glycomet GP 1", notesEnglish: null });
    expect(applyGuardrail).toHaveBeenCalledWith({ content: [{ text: { text: "You should double the dose" } }] });
  });

  it("only screens rows that have notes", async () => {
    const applyGuardrail = vi.fn();
    await runExtraction("m", ports({ applyGuardrail }));
    expect(applyGuardrail).not.toHaveBeenCalled();
  });

  it("treats a prescription with no medicines as a failure the family can fix by hand", async () => {
    expect(await runExtraction("m", ports({ converse: async () => toolOutput([]) }))).toMatchObject({ ok: false, failure: "no_medicines" });
  });
});

describe("confirming a prescription", () => {
  const rows = [{ rowId: "r1" }, { rowId: "r2" }];
  const confirm = (rowId: string): ConfirmDecision => ({
    rowId,
    action: "confirm",
    checked: true,
    medicine: { nameAsPrinted: "Glycomet GP 1", strength: null, slots: { morning: 1 }, food: null, critical: false, asNeeded: false, pillsLeft: 30, refillThresholdDays: 5, endDate: null },
  });

  it("requires a decision for every row", () => {
    expect(() => checkDecisions(rows, [confirm("r1")])).toThrow(/checked or removed/);
  });

  it("rejects unknown and repeated rows", () => {
    expect(() => checkDecisions(rows, [confirm("r1"), confirm("r3")])).toThrow(/Unknown row/);
    expect(() => checkDecisions(rows, [confirm("r1"), confirm("r1"), { rowId: "r2", action: "remove" }])).toThrow(/twice/);
  });

  it("saves only confirmed rows, and refuses when everything was removed", () => {
    expect(checkDecisions(rows, [confirm("r1"), { rowId: "r2", action: "remove" }])).toHaveLength(1);
    expect(() => checkDecisions(rows, [{ rowId: "r1", action: "remove" }, { rowId: "r2", action: "remove" }])).toThrow(/Nothing to save/);
  });

  it("keeps the model image within the Bedrock limit", () => {
    expect(MAX_MODEL_BYTES).toBeLessThanOrEqual(3.75 * 1024 * 1024);
  });

describe("demo sample prescription", () => {
  it("shows every review level a family would meet", () => {
    const { rows, lines } = samplePrescription();
    expect(rows.map((r) => r.level)).toEqual(["amber", "green", "amber", "green"]);
    expect(rows[2]?.reasons).toEqual(expect.arrayContaining(["handwritten", "low_ocr_confidence", "amount_not_written"]));
    expect(rows[3]?.schedule.asNeeded).toBe(true);
    expect(rows[0]?.schedule).toMatchObject({ slots: { morning: 1, night: 1 }, food: "after", durationDays: 30 });
    for (const line of lines) expect(line.box!.left + line.box!.width).toBeLessThanOrEqual(1);
  });
});
});
