import { DEMO_FAMILY_PREFIX, reportOutcome, summariseAdherence, type DoseStatus, type MissClass } from "@dosecircle/shared";
import { describe, expect, it } from "vitest";
import { buildDemoSeed, istTime } from "../src/demo/fixtures.js";

const now = Date.parse("2026-09-18T10:30:00+05:30");
const seed = buildDemoSeed({ sid: "s-0123456789ab", now, ttl: 1_900_000_000 });
const items = seed.items as { PK: string; SK: string; ttl?: number; status?: string; missClass?: string; critical?: boolean; pillsLeft?: number | null }[];

describe("demo fixtures", () => {
  it("only ever creates a demo family", () => {
    expect(seed.fid.startsWith(DEMO_FAMILY_PREFIX)).toBe(true);
  });

  it("gives every item a TTL and unique keys", () => {
    expect(items.every((i) => typeof i.ttl === "number")).toBe(true);
    const keys = new Set(items.map((i) => `${i.PK}|${i.SK}`));
    expect(keys.size).toBe(items.length);
  });

  it("writes in a handful of DynamoDB batches", () => {
    // Seeding a demo session is one burst of BatchWriteItem calls; keeping it small keeps "start the
    // demo" instant for a judge. 30 days of doses plus their readings is the bulk of it.
    expect(Math.ceil(items.length / 25)).toBeLessThanOrEqual(6);
  });

  it("seeds thirty days of history with misses, offline days and claims by both children", () => {
    const doses = items.filter((i) => i.SK.startsWith("DOSE#")) as { status: string; missClass?: string; claimedBy?: string }[];
    expect(doses).toHaveLength(60);
    expect(doses.filter((d) => d.missClass === "OFFLINE")).toHaveLength(2);
    expect(doses.filter((d) => d.status === "UNRESOLVED")).toHaveLength(1);
    expect(new Set(doses.map((d) => d.claimedBy).filter(Boolean))).toEqual(new Set([seed.sonId, seed.daughterId]));
    // Nothing seeded for today, so the live demo dose is the only one on the parent's screen.
    expect(doses.every((d) => !(d as { SK?: string }).SK?.startsWith("DOSE#20260918"))).toBe(true);
  });

  it("is identical every time, so demos and the video match", () => {
    const again = buildDemoSeed({ sid: "s-0123456789ab", now, ttl: 1_900_000_000 });
    expect(JSON.stringify(again.items, (_k, v) => (v instanceof Set ? [...v] : v))).toBe(JSON.stringify(seed.items, (_k, v) => (v instanceof Set ? [...v] : v)));
  });

  it("has a critical night slot and a medicine low enough to trigger the refill warning", () => {
    const night = items.find((i) => i.SK === "SLOT#2100");
    expect(night?.critical).toBe(true);
    expect(items.some((i) => i.SK.startsWith("MED#") && i.pillsLeft === 6)).toBe(true);
  });

  it("schedules the morning checks and seeds readings for most, but not all, of the month", () => {
    const checks = items.filter((i) => i.SK.startsWith("CHECK#")) as unknown as { checkId: string; type: string; escalates: boolean; weekdays: number[] }[];
    expect(checks.map((c) => c.type).sort()).toEqual(["bp", "glucose", "weight"]);
    // Sugar and blood pressure alert the family; the weekly weigh-in deliberately does not.
    expect(checks.find((c) => c.type === "weight")).toMatchObject({ escalates: false, weekdays: [0] });
    expect(checks.filter((c) => c.escalates).map((c) => c.type).sort()).toEqual(["bp", "glucose"]);
    // Only the morning reminder asks for them.
    expect(items.find((i) => i.SK === "SLOT#0800") as unknown as { checkIds: string[] }).toMatchObject({ checkIds: ["chk-sugar", "chk-bp", "chk-weight"] });
    expect((items.find((i) => i.SK === "SLOT#2100") as unknown as { checkIds: string[] }).checkIds).toEqual([]);

    const readings = items.filter((i) => i.SK.startsWith("READING#")) as unknown as { SK: string; checkId: string; type: string; values: Record<string, number>; doseId: string }[];
    const sugar = readings.filter((r) => r.checkId === "chk-sugar");
    expect(sugar.length).toBeGreaterThanOrEqual(24);
    // Some mornings genuinely have no reading, which is what makes the "written down" count honest.
    expect(sugar.length).toBeLessThan(30);
    expect(new Set(sugar.map((r) => r.SK.slice("READING#".length, "READING#".length + 10))).size).toBe(sugar.length);
    // Every reading is a plausible number tied to that morning's reminder, and nothing else.
    for (const reading of readings) {
      expect(reading.doseId).toMatch(/^p-demo0123456789ab_\d{12}$/);
      for (const value of Object.values(reading.values)) expect(Number.isFinite(value)).toBe(true);
    }
    expect(readings.filter((r) => r.checkId === "chk-weight").length).toBeGreaterThan(2);
  });

  it("works out IST hours regardless of the machine's time zone", () => {
    expect(new Date(istTime(Date.parse("2026-09-18T23:30:00+05:30"), 8)).toISOString()).toBe("2026-09-18T02:30:00.000Z");
    expect(new Date(istTime(Date.parse("2026-09-18T00:10:00+05:30"), 21)).toISOString()).toBe("2026-09-18T15:30:00.000Z");
  });

  it("tells a believable month: mostly taken, a few missed, two unknown", () => {
    const doses = items.filter((i) => i.SK.startsWith("DOSE#")) as { status: DoseStatus; missClass?: MissClass }[];
    const summary = summariseAdherence(doses.map((d) => reportOutcome(d)));
    expect(summary).toMatchObject({ onTime: 51, late: 2, missed: 5, unknown: 2 });
    expect(summary.adherence).toBeCloseTo(53 / 58);
  });
});
