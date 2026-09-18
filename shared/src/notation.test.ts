import { describe, expect, it } from "vitest";
import { interpretNotation, parseDosePattern, parseDuration, parseFoodCode, parseFrequencyCode } from "./notation.js";

describe("parseDosePattern", () => {
  it("reads three-part patterns as morning-afternoon-night", () => {
    expect(parseDosePattern("1-0-1")).toEqual({ morning: 1, night: 1 });
    expect(parseDosePattern("1-1-1")).toEqual({ morning: 1, afternoon: 1, night: 1 });
    expect(parseDosePattern("0-0-1")).toEqual({ night: 1 });
  });

  it("reads four-part patterns including evening", () => {
    expect(parseDosePattern("1-1-1-1")).toEqual({ morning: 1, afternoon: 1, evening: 1, night: 1 });
  });

  it("accepts spaces, en dashes and halves", () => {
    expect(parseDosePattern("1 - 0 - 1")).toEqual({ morning: 1, night: 1 });
    expect(parseDosePattern("1–0–1")).toEqual({ morning: 1, night: 1 });
    expect(parseDosePattern("½-0-½")).toEqual({ morning: 0.5, night: 0.5 });
    expect(parseDosePattern("1/2-0-1/2")).toEqual({ morning: 0.5, night: 0.5 });
  });

  it("rejects anything that is not a pattern", () => {
    expect(parseDosePattern("101")).toBeNull();
    expect(parseDosePattern("1-0")).toBeNull();
    expect(parseDosePattern("x-0-1")).toBeNull();
  });
});

describe("codes", () => {
  it("maps frequency codes with punctuation and case variations", () => {
    expect(parseFrequencyCode("OD")).toEqual({ kind: "daily", slots: ["morning"] });
    expect(parseFrequencyCode("b.d.")).toEqual({ kind: "daily", slots: ["morning", "night"] });
    expect(parseFrequencyCode("TDS")).toEqual({ kind: "daily", slots: ["morning", "afternoon", "night"] });
    expect(parseFrequencyCode("HS")).toEqual({ kind: "daily", slots: ["night"] });
    expect(parseFrequencyCode("SOS")).toEqual({ kind: "as_needed" });
    expect(parseFrequencyCode("STAT")).toEqual({ kind: "not_daily" });
    expect(parseFrequencyCode("weekly-ish")).toBeNull();
  });

  it("maps food timing", () => {
    expect(parseFoodCode("AC")).toBe("before");
    expect(parseFoodCode("p.c.")).toBe("after");
    expect(parseFoodCode("after food")).toBe("after");
    expect(parseFoodCode("empty stomach")).toBe("before");
    expect(parseFoodCode("with milk")).toBeNull();
  });

  it("maps durations including Indian clinical shorthand", () => {
    expect(parseDuration("x 5 days")).toEqual({ days: 5, approximate: false, recognised: true });
    expect(parseDuration("5/7")).toEqual({ days: 5, approximate: false, recognised: true });
    expect(parseDuration("2/52")).toEqual({ days: 14, approximate: false, recognised: true });
    expect(parseDuration("1/12")).toEqual({ days: 30, approximate: true, recognised: true });
    expect(parseDuration("2 weeks")).toEqual({ days: 14, approximate: false, recognised: true });
    expect(parseDuration("continue")).toEqual({ days: null, approximate: false, recognised: true });
    expect(parseDuration("till review")).toEqual({ days: null, approximate: false, recognised: false });
  });

  it("does not mistake milligrams for months", () => {
    expect(parseDuration("500 mg").recognised).toBe(false);
  });
});

describe("interpretNotation", () => {
  it("uses the pattern when it agrees with the code", () => {
    const result = interpretNotation({ dosePatternAsWritten: "1-0-1", frequencyCodeAsWritten: "BD", foodCodeAsWritten: "PC", durationAsWritten: "x 5 days" });
    expect(result).toEqual({ slots: { morning: 1, night: 1 }, asNeeded: false, food: "after", durationDays: 5, unresolved: [] });
  });

  it("flags a pattern that disagrees with the code", () => {
    const result = interpretNotation({ dosePatternAsWritten: "1-1-1", frequencyCodeAsWritten: "BD" });
    expect(result.slots).toEqual({ morning: 1, afternoon: 1, night: 1 });
    expect(result.unresolved).toContain("pattern_frequency_conflict");
  });

  it("never assumes an amount when only a code is written", () => {
    const result = interpretNotation({ frequencyCodeAsWritten: "TDS" });
    expect(result.slots).toEqual({ morning: null, afternoon: null, night: null });
    expect(result.unresolved).toEqual(["amount_not_written"]);
  });

  it("treats SOS as as-needed and never schedules it", () => {
    const result = interpretNotation({ frequencyCodeAsWritten: "SOS" });
    expect(result.asNeeded).toBe(true);
    expect(result.slots).toEqual({});
    expect(result.unresolved).toEqual([]);
  });

  it("flags non-daily schedules the app cannot represent", () => {
    const result = interpretNotation({ frequencyCodeAsWritten: "EOD" });
    expect(result.slots).toEqual({});
    expect(result.unresolved).toEqual(["frequency_not_daily"]);
  });

  it("flags unreadable and missing input", () => {
    expect(interpretNotation({ dosePatternAsWritten: "?-0-1" }).unresolved).toEqual(["pattern_unreadable", "no_schedule_found"]);
    expect(interpretNotation({}).unresolved).toEqual(["no_schedule_found"]);
    expect(interpretNotation({ dosePatternAsWritten: "1-0-0", foodCodeAsWritten: "with milk" }).unresolved).toEqual(["food_unknown"]);
  });
});

describe("frequency codes written with a word beside them", () => {
  // Every one of these came off a real prescription the deployed pipeline read.
  it("reads the code when a word sits next to it", () => {
    expect(parseFrequencyCode("OD morning")).toEqual({ kind: "daily", slots: ["morning"] });
    expect(parseFrequencyCode("HS at bedtime")).toEqual({ kind: "daily", slots: ["night"] });
    expect(parseFrequencyCode("BD (after food)")).toEqual({ kind: "daily", slots: ["morning", "night"] });
    expect(parseFrequencyCode("1 tab TDS")).toEqual({ kind: "daily", slots: ["morning", "afternoon", "night"] });
  });

  it("still reads a bare code, spaced or not", () => {
    expect(parseFrequencyCode("OD")).toEqual({ kind: "daily", slots: ["morning"] });
    expect(parseFrequencyCode(" b d ")).toEqual({ kind: "daily", slots: ["morning", "night"] });
    expect(parseFrequencyCode("SOS")).toEqual({ kind: "as_needed" });
  });

  it("refuses to guess between two codes, or when there is none", () => {
    expect(parseFrequencyCode("OD or BD")).toBeNull();
    expect(parseFrequencyCode("as directed")).toBeNull();
    expect(parseFrequencyCode("")).toBeNull();
  });
});
