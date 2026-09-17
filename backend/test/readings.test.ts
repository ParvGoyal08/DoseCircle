import type { PlannedCheck } from "@dosecircle/shared";
import { describe, expect, it } from "vitest";
import { buildReadingSeries, type ReadingRow } from "../src/views/readings.js";

const bp: PlannedCheck = { checkId: "chk-bp", type: "bp", slots: ["morning"], escalates: true, active: true };
const weight: PlannedCheck = { checkId: "chk-wt", type: "weight", slots: ["morning"], weekdays: [0], escalates: false, active: true };

/** 08:00 IST on the given day. */
const at = (date: string) => `${date}T02:30:00.000Z`;

const reading = (checkId: string, date: string, values: Record<string, number>): ReadingRow => ({
  checkId,
  type: checkId === "chk-bp" ? "bp" : "weight",
  values,
  at: at(date),
});

describe("buildReadingSeries", () => {
  it("builds one series per check, oldest reading first", () => {
    const [series] = buildReadingSeries({
      readings: [
        reading("chk-bp", "2026-09-16", { systolic: 132, diastolic: 84 }),
        reading("chk-bp", "2026-09-14", { systolic: 128, diastolic: 80 }),
        reading("chk-bp", "2026-09-15", { systolic: 140, diastolic: 88 }),
      ],
      checks: [bp],
      from: "2026-09-14",
      to: "2026-09-16",
    });
    expect(series!.points.map((p) => p.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(series!.points[0]!.text).toBe("128/80 mmHg");
    expect(series!.latest?.date).toBe("2026-09-16");
    expect(series!.askedDays).toBe(3);
    expect(series!.recordedDays).toBe(3);
  });

  it("describes the spread without judging any reading", () => {
    const [series] = buildReadingSeries({
      readings: [
        reading("chk-bp", "2026-09-14", { systolic: 128, diastolic: 80 }),
        reading("chk-bp", "2026-09-15", { systolic: 140, diastolic: 88 }),
        reading("chk-bp", "2026-09-16", { systolic: 132, diastolic: 84 }),
      ],
      checks: [bp],
      from: "2026-09-14",
      to: "2026-09-16",
    });
    expect(series!.spread).toEqual([
      { key: "systolic", unit: "mmHg", lowest: 128, highest: 140, middle: 132 },
      { key: "diastolic", unit: "mmHg", lowest: 80, highest: 88, middle: 84 },
    ]);
    // Nothing in the series says whether any of this is good or bad. "lowest" and "highest"
    // describe the data itself; a verdict would read "high", "normal", "target" or "alert".
    expect(JSON.stringify(series)).not.toMatch(/\b(high|low|normal|abnormal|target|alert|risk|good|bad)\b/i);
  });

  it("counts only the days a check was actually asked for", () => {
    // 2026-09-14 is a Monday, so the only Sunday in this fortnight is the 20th.
    const [series] = buildReadingSeries({
      readings: [reading("chk-wt", "2026-09-20", { weight: 61.4 })],
      checks: [weight],
      from: "2026-09-14",
      to: "2026-09-27",
    });
    expect(series!.askedDays).toBe(2); // the 20th and the 27th
    expect(series!.recordedDays).toBe(1);
  });

  it("leaves out readings from outside the period and days with no reading", () => {
    const [series] = buildReadingSeries({
      readings: [reading("chk-bp", "2026-09-10", { systolic: 120, diastolic: 78 }), reading("chk-bp", "2026-09-15", { systolic: 128, diastolic: 80 })],
      checks: [bp],
      from: "2026-09-14",
      to: "2026-09-16",
    });
    expect(series!.points).toHaveLength(1);
    expect(series!.askedDays).toBe(3);
    expect(series!.recordedDays).toBe(1);
  });

  it("gives a check with no readings an empty series rather than dropping it", () => {
    const [series] = buildReadingSeries({ readings: [], checks: [bp], from: "2026-09-14", to: "2026-09-16" });
    expect(series).toMatchObject({ checkId: "chk-bp", points: [], latest: null, spread: [], recordedDays: 0, askedDays: 3 });
  });

  it("puts a reading taken early in the Indian morning on the right day", () => {
    // 01:00 IST on the 15th is 19:30Z on the 14th.
    const [series] = buildReadingSeries({
      readings: [{ checkId: "chk-bp", type: "bp", values: { systolic: 126, diastolic: 79 }, at: "2026-09-14T19:30:00.000Z" }],
      checks: [bp],
      from: "2026-09-15",
      to: "2026-09-15",
    });
    expect(series!.points.map((p) => p.date)).toEqual(["2026-09-15"]);
  });
});
