import { describe, expect, it } from "vitest";
import { CHECK_DEFINITIONS, checkDefinition, formatReading, isCheckDueAt, isCheckType, roundReading, validateReading, type PlannedCheck } from "./checks.js";

describe("check definitions", () => {
  it("names every type it exposes", () => {
    for (const [key, definition] of Object.entries(CHECK_DEFINITIONS)) {
      expect(definition.type).toBe(key);
      expect(isCheckType(key)).toBe(true);
      // The chart has to plot a field the reading actually carries.
      expect(definition.fields.some((f) => f.key === definition.chart.primary)).toBe(true);
      if (definition.chart.secondary) expect(definition.fields.some((f) => f.key === definition.chart.secondary)).toBe(true);
    }
    expect(isCheckType("cholesterol")).toBe(false);
  });

  it("only escalates for the checks a doctor acts on quickly", () => {
    expect(checkDefinition("glucose").escalatesByDefault).toBe(true);
    expect(checkDefinition("bp").escalatesByDefault).toBe(true);
    expect(checkDefinition("weight").escalatesByDefault).toBe(false);
  });
});

describe("validateReading", () => {
  it("accepts a plausible reading", () => {
    expect(validateReading("bp", { systolic: 128, diastolic: 82, pulse: 74 })).toEqual([]);
    expect(validateReading("glucose", { glucose: 112 })).toEqual([]);
  });

  it("does not need an optional field", () => {
    expect(validateReading("bp", { systolic: 128, diastolic: 82 })).toEqual([]);
  });

  it("asks for a missing required field", () => {
    expect(validateReading("bp", { systolic: 128 })).toEqual([{ field: "diastolic", reason: "missing" }]);
  });

  it("catches typing mistakes without judging the reading", () => {
    // 20 mg/dL is impossible to type by accident but 700 is the top of the meter's range: both ends
    // are allowed, because the app must never decide a real reading is "wrong".
    expect(validateReading("glucose", { glucose: 700 })).toEqual([]);
    expect(validateReading("glucose", { glucose: 7000 })).toEqual([{ field: "glucose", reason: "out_of_range" }]);
    expect(validateReading("weight", { weight: 705 })).toEqual([{ field: "weight", reason: "out_of_range" }]);
    expect(validateReading("bp", { systolic: 20, diastolic: 82 })).toEqual([{ field: "systolic", reason: "out_of_range" }]);
  });

  it("refuses a field the report could not label", () => {
    expect(validateReading("weight", { weight: 70, mood: 3 })).toEqual([{ field: "mood", reason: "unknown_field" }]);
  });

  it("refuses values that are not finite numbers", () => {
    expect(validateReading("spo2", { spo2: Number.NaN })).toEqual([{ field: "spo2", reason: "out_of_range" }]);
  });
});

describe("roundReading", () => {
  it("keeps the decimals each measurement is taken to", () => {
    expect(roundReading("weight", { weight: 70.25 })).toEqual({ weight: 70.3 });
    expect(roundReading("glucose", { glucose: 112.6 })).toEqual({ glucose: 113 });
    expect(roundReading("temperature", { temperature: 37.44 })).toEqual({ temperature: 37.4 });
  });

  it("drops anything the check does not measure", () => {
    expect(roundReading("weight", { weight: 70, mood: 3 })).toEqual({ weight: 70 });
  });
});

describe("formatReading", () => {
  it("reads as a person would say it", () => {
    expect(formatReading("bp", { systolic: 128, diastolic: 82 })).toBe("128/82 mmHg");
    expect(formatReading("glucose", { glucose: 112 })).toBe("112 mg/dL");
    expect(formatReading("weight", { weight: 70.3 })).toBe("70.3 kg");
    expect(formatReading("temperature", { temperature: 37.4 })).toBe("37.4 °C");
  });

  it("says nothing rather than something misleading when a value is missing", () => {
    expect(formatReading("bp", { systolic: 128 })).toBe("");
    expect(formatReading("glucose", {})).toBe("");
  });
});

describe("isCheckDueAt", () => {
  const check: PlannedCheck = { checkId: "sugar", type: "glucose", slots: ["morning"], escalates: true, active: true };

  it("is due at its own times of day only", () => {
    expect(isCheckDueAt(check, "morning", "2026-09-18", 5)).toBe(true);
    expect(isCheckDueAt(check, "night", "2026-09-18", 5)).toBe(false);
  });

  it("stops when it is switched off or past its last day", () => {
    expect(isCheckDueAt({ ...check, active: false }, "morning", "2026-09-18", 5)).toBe(false);
    expect(isCheckDueAt({ ...check, endDate: "2026-09-18" }, "morning", "2026-09-18", 5)).toBe(true);
    expect(isCheckDueAt({ ...check, endDate: "2026-09-17" }, "morning", "2026-09-18", 5)).toBe(false);
  });

  it("respects chosen days of the week, and treats no choice as every day", () => {
    const sundays = { ...check, weekdays: [0] };
    expect(isCheckDueAt(sundays, "morning", "2026-09-20", 0)).toBe(true);
    expect(isCheckDueAt(sundays, "morning", "2026-09-18", 5)).toBe(false);
    expect(isCheckDueAt({ ...check, weekdays: [] }, "morning", "2026-09-18", 5)).toBe(true);
  });
});
