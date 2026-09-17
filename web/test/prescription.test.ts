import { describe, expect, it } from "vitest";
import { samplePrescription } from "../../backend/src/demo/sample-prescription";
import { draftFromRow } from "../src/components/PrescriptionReview";

describe("prescription drafts", () => {
  const rows = samplePrescription().rows;

  it("pre-fills only what was written", () => {
    const glycomet = draftFromRow(rows[0]!);
    expect(glycomet).toMatchObject({ nameAsPrinted: "Glycomet GP 1", slots: { morning: 1, night: 1 }, food: "after", asNeeded: false });
    expect(glycomet.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves an unwritten amount for the person to decide", () => {
    const lantus = draftFromRow(rows[2]!);
    expect(lantus.slots).toEqual({});
  });

  it("keeps as-needed medicines unscheduled", () => {
    expect(draftFromRow(rows[3]!)).toMatchObject({ asNeeded: true, slots: {} });
  });
});
