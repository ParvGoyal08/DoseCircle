import { describe, expect, it } from "vitest";
import { extractionToolInputSchema, PrescriptionExtractionSchema, type ExtractedMedicine } from "../src/ai/schema.js";
import { isUnreadable, reviewRow, type OcrLine } from "../src/ai/review.js";
import {
  isDeviceTokenShape,
  newDeviceToken,
  newInviteCode,
  normaliseInviteCode,
  pushTopic,
  sha256Hex,
  signReceipt,
  verifyReceipt,
} from "../src/lib/crypto.js";
import { encodePushPayload, MAX_PAYLOAD_BYTES, PayloadTooLargeError } from "../src/lib/push-payload.js";
import { buildDoctorReport } from "../src/report/build.js";

describe("crypto", () => {
  it("creates 8-character Crockford invite codes and normalises what people type", () => {
    const code = newInviteCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    // Upper-case, drop spaces and dashes, then O→0 and I/L→1.
    expect(normaliseInviteCode("ab1o-l2 3z")).toBe("AB10123Z");
  });

  it("creates device tokens with 256 bits of randomness", () => {
    const token = newDeviceToken();
    expect(isDeviceTokenShape(token)).toBe(true);
    expect(newDeviceToken()).not.toBe(token);
    expect(sha256Hex(token)).toHaveLength(64);
  });

  it("verifies receipt signatures and rejects tampering", () => {
    const sig = signReceipt("secret", "p1_202609170800", "REMIND", "dev1");
    expect(verifyReceipt("secret", "p1_202609170800", "REMIND", "dev1", sig)).toBe(true);
    expect(verifyReceipt("secret", "p1_202609170800", "ALERT", "dev1", sig)).toBe(false);
    expect(verifyReceipt("other", "p1_202609170800", "REMIND", "dev1", sig)).toBe(false);
    expect(verifyReceipt("secret", "p1_202609170800", "REMIND", "dev1", "short")).toBe(false);
  });

  it("keeps the push Topic header within 32 URL-safe characters", () => {
    const topic = pushTopic("a-very-long-parent-identifier_202609170800_12", "BROADCAST");
    expect(topic).toHaveLength(32);
    expect(topic).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("push payload", () => {
  it("accepts a realistic Kannada notification", () => {
    const json = encodePushPayload({
      t: "ಬೆಳಿಗ್ಗೆ",
      b: "ನಿಮ್ಮ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಾಗಿದೆ",
      l: "kn",
      doseId: "p1_202609170800",
      step: "REMIND",
      r: "dev1",
      url: "/parent/dose/p1_202609170800",
      kind: "parent",
      sig: "x".repeat(43),
    });
    expect(Buffer.byteLength(json)).toBeLessThan(MAX_PAYLOAD_BYTES);
  });

  it("measures bytes, not characters, for Indic text", () => {
    const body = "ಕ".repeat(1400); // 1,400 characters but 4,200 bytes
    expect(() =>
      encodePushPayload({ t: "", b: body, l: "kn", step: "REMIND", r: "d", url: "/", kind: "parent", sig: "" }),
    ).toThrow(PayloadTooLargeError);
  });
});

describe("prescription review", () => {
  const lines: OcrLine[] = [
    { id: "L1", text: "Tab Telma 40", confidence: 97, handwriting: false },
    { id: "L2", text: "1-0-0 x 30 days", confidence: 95, handwriting: false },
    { id: "L3", text: "Glycomet GP 1 1-0-1 PC", confidence: 71, handwriting: true },
  ];
  const base: ExtractedMedicine = {
    lineRefs: ["L1", "L2"],
    drugAsWritten: "Telma",
    strength: "40",
    dosePatternAsWritten: "1-0-0",
    frequencyCodeAsWritten: null,
    foodCodeAsWritten: null,
    durationAsWritten: "x 30 days",
    legible: true,
    uncertainFields: [],
    notesEnglish: null,
  };

  it("is green only when nothing looked wrong", () => {
    const row = reviewRow(base, lines);
    expect(row.level).toBe("green");
    expect(row.schedule.slots).toEqual({ morning: 1 });
    expect(row.schedule.durationDays).toBe(30);
  });

  it("is amber for handwriting or low OCR confidence", () => {
    const row = reviewRow({ ...base, lineRefs: ["L3"], drugAsWritten: "Glycomet GP", strength: "1", dosePatternAsWritten: "1-0-1", foodCodeAsWritten: "PC", durationAsWritten: null }, lines);
    expect(row.level).toBe("amber");
    expect(row.reasons).toEqual(expect.arrayContaining(["handwritten", "low_ocr_confidence"]));
  });

  it("is red when the name or schedule is missing", () => {
    expect(reviewRow({ ...base, drugAsWritten: null }, lines).level).toBe("red");
    expect(reviewRow({ ...base, dosePatternAsWritten: null }, lines).level).toBe("red");
  });

  it("fails extraction when there is too little readable text", () => {
    expect(isUnreadable([lines[0]!])).toBe(true);
    expect(isUnreadable(lines.map((l) => ({ ...l, confidence: 30 })))).toBe(true);
    expect(isUnreadable(lines)).toBe(false);
  });

  it("produces a JSON schema for the Bedrock tool and validates model output", () => {
    const schema = extractionToolInputSchema();
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
    expect(PrescriptionExtractionSchema.safeParse({ medicines: [base], unreadableLineRefs: [] }).success).toBe(true);
    expect(PrescriptionExtractionSchema.safeParse({ medicines: [{ ...base, legible: "yes" }], unreadableLineRefs: [] }).success).toBe(false);
  });
});

describe("doctor report", () => {
  it("counts offline as unknown and computes adherence per medicine", () => {
    const report = buildDoctorReport(
      [
        { medId: "m1", nameAsPrinted: "Telma 40", strength: "40 mg" },
        { medId: "m2", nameAsPrinted: "Glycomet GP 1", strength: null },
      ],
      [
        { doseId: "p_202609140800", doseStamp: "202609140800", medIds: ["m1", "m2"], status: "TAKEN" },
        { doseId: "p_202609142100", doseStamp: "202609142100", medIds: ["m2"], status: "UNRESOLVED", missClass: "MISSED" },
        { doseId: "p_202609150800", doseStamp: "202609150800", medIds: ["m1", "m2"], status: "CLAIMED", missClass: "OFFLINE", claimedByName: "Rohan" },
        { doseId: "p_202609152100", doseStamp: "202609152100", medIds: ["m2"], status: "TAKEN_LATE" },
      ],
    );
    expect(report.rows.find((r) => r.medId === "m1")).toMatchObject({ onTime: 1, missed: 0, unknown: 1, adherence: 1 });
    expect(report.rows.find((r) => r.medId === "m2")).toMatchObject({ onTime: 1, late: 1, missed: 1, unknown: 1, adherence: 2 / 3 });
    expect(report.misses).toEqual([
      { doseStamp: "202609142100", outcome: "missed", medicineNames: ["Glycomet GP 1"], handledBy: null },
      { doseStamp: "202609150800", outcome: "unknown", medicineNames: ["Telma 40", "Glycomet GP 1"], handledBy: "Rohan" },
    ]);
    expect(report.grid["20260915"]?.["0800"]).toBe("unknown");
  });
});
