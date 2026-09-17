import { describe, expect, it } from "vitest";
import { buildDemoSeed } from "../src/demo/fixtures.js";
import type { DoseItem, MedicineItem } from "../src/lib/model.js";
import { buildInsights, istDateOf, median, spread, type InsightDose } from "../src/views/insights.js";

const now = Date.parse("2026-09-18T10:30:00+05:30");
const seed = buildDemoSeed({ sid: "s-0123456789ab", now, ttl: 1_900_000_000 });
const doses = seed.items.filter((i) => String(i.SK).startsWith("DOSE#")) as unknown as DoseItem[];
const medicines = seed.items.filter((i) => String(i.SK).startsWith("MED#")) as unknown as MedicineItem[];
const ladder = [
  { mid: seed.sonId, displayName: "Arjun" },
  { mid: seed.daughterId, displayName: "Meera" },
];
const yesterday = istDateOf(now - 86_400_000);
const insights = (days: number, previousDoses: InsightDose[] = []) => buildInsights({ doses, previousDoses, medicines, ladder, to: yesterday, days });

describe("insights", () => {
  const month = insights(30);

  it("summarises the period, never counting an offline phone as a miss", () => {
    expect(month.range).toMatchObject({ to: yesterday, days: 30 });
    expect(month.headline).toMatchObject({ onTime: 51, late: 2, missed: 5, unknown: 2 });
    expect(month.headline.adherence).toBeCloseTo(53 / 58);
    expect(month.daily).toHaveLength(30);
    expect(month.daily.reduce((sum, d) => sum + d.missed, 0)).toBe(5);
  });

  it("tracks the current and best streak of taken doses", () => {
    expect(month.headline.bestStreak).toBeGreaterThanOrEqual(month.headline.currentStreak);
    // The last miss was three nights ago; since then: a morning, a late night, then yesterday's two doses.
    expect(month.headline.currentStreak).toBe(4);
  });

  it("builds a calendar with one row per dose time in India time", () => {
    expect(month.calendar.times).toEqual(["0800", "2100"]);
    expect(month.calendar.days[month.calendar.days.length - 1]!.cells).toEqual({ "0800": "on_time", "2100": "on_time" });
  });

  it("measures timing only for taken doses", () => {
    expect(month.timing).toHaveLength(53);
    expect(month.timing.filter((t) => t.late).every((t) => t.delayMinutes > 30)).toBe(true);
    expect(month.consistency.medianDelayMinutes).toBeGreaterThan(0);
  });

  it("shows who resolved escalations, in family order, with how fast they claimed", () => {
    expect(month.escalation).toMatchObject({ doses: 60, parentOnTime: 51, parentLate: 2, unresolved: 1 });
    expect(month.escalation.claimedBy.map((c) => [c.displayName, c.count])).toEqual([
      ["Arjun", 4],
      ["Meera", 2],
    ]);
    const [arjun, meera] = month.responders;
    expect(arjun).toMatchObject({ position: 1, claims: 4 });
    expect(meera).toMatchObject({ position: 2, claims: 2 });
    expect(arjun!.medianMinutesToClaim!).toBeLessThan(meera!.medianMinutesToClaim!);
  });

  it("finds the evening slot slipping and the medicine running low", () => {
    const week = insights(7);
    expect(week.highlights).toContainEqual({ code: "slot_slipping", slotName: "night" });
    expect(month.refills[0]).toMatchObject({ nameAsPrinted: "Glycomet GP 1", pillsLeft: 6, perDay: 2, daysLeft: 3 });
    expect(month.highlights).toContainEqual({ code: "refill_soon", medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1" });
    expect(month.highlights).toContainEqual({ code: "phone_offline_often" });
  });

  it("lists the weakest medicine first", () => {
    expect(month.medicines.map((m) => m.nameAsPrinted)).toEqual(["Glycomet GP 1", "Lantus", "Telma 40"].sort((a, b) => {
      const rate = (name: string) => month.medicines.find((m) => m.nameAsPrinted === name)!.adherence ?? 1;
      return rate(a) - rate(b);
    }));
    expect(month.medicines).toHaveLength(3);
  });

  it("counts phone reachability per day", () => {
    const offlineDays = month.reachability.filter((d) => d.reached < d.reminders);
    expect(offlineDays).toHaveLength(2);
  });

  it("compares against the previous period", () => {
    const worse = doses.map((d) => ({ ...d, status: "UNRESOLVED" as const, missClass: "MISSED" as const }));
    expect(insights(30, worse).highlights).toContainEqual({ code: "improving" });
  });

  it("uses robust statistics", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
    expect(spread([1, 2, 3])).toBeNull();
    expect(spread([0, 10, 20, 30, 40])).toBe(20);
  });
});
