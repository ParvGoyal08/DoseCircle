import { describe, expect, it } from "vitest";
import { formatCount, formatGap, formatNumber, formatTime } from "../src/lib/format";

describe("formatting", () => {
  it("shows halves and quarters as fractions", () => {
    expect(formatCount(0.5)).toBe("½");
    expect(formatCount(1.5)).toBe("1½");
    expect(formatCount(2)).toBe("2");
    expect(formatCount(null)).toBe("?");
  });

  it("uses Western digits in every language", () => {
    for (const lang of ["kn", "hi", "mr", "bn"]) expect(formatNumber(1234, lang)).toMatch(/^[\d,.\s]+$/);
    expect(formatGap(600, "hi")).toMatch(/^\+10/);
  });

  it("shows times in India time wherever the browser is", () => {
    expect(formatTime("2026-09-18T02:30:00Z", "en-GB")).toBe("8:00");
  });
});
