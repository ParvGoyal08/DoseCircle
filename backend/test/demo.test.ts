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

  it("stays within one DynamoDB batch per 25 items", () => {
    expect(items.length).toBeLessThan(50);
  });

  it("seeds six days of history with one missed and one offline dose", () => {
    const doses = items.filter((i) => i.SK.startsWith("DOSE#"));
    expect(doses).toHaveLength(12);
    expect(doses.filter((d) => d.missClass === "OFFLINE")).toHaveLength(1);
    expect(doses.filter((d) => d.status === "UNRESOLVED")).toHaveLength(1);
    // Nothing seeded for today, so the live demo dose is the only one on the parent's screen.
    expect(doses.every((d) => !d.SK.startsWith("DOSE#20260918"))).toBe(true);
  });

  it("has a critical night slot and a medicine low enough to trigger the refill warning", () => {
    const night = items.find((i) => i.SK === "SLOT#2100");
    expect(night?.critical).toBe(true);
    expect(items.some((i) => i.SK.startsWith("MED#") && i.pillsLeft === 6)).toBe(true);
  });

  it("works out IST hours regardless of the machine's time zone", () => {
    expect(new Date(istTime(Date.parse("2026-09-18T23:30:00+05:30"), 8)).toISOString()).toBe("2026-09-18T02:30:00.000Z");
    expect(new Date(istTime(Date.parse("2026-09-18T00:10:00+05:30"), 21)).toISOString()).toBe("2026-09-18T15:30:00.000Z");
  });

  it("tells a believable week: one missed, one unknown, the rest taken", () => {
    const doses = items.filter((i) => i.SK.startsWith("DOSE#")) as { status: DoseStatus; missClass?: MissClass }[];
    const summary = summariseAdherence(doses.map((d) => reportOutcome(d)));
    expect(summary).toMatchObject({ onTime: 9, late: 1, missed: 1, unknown: 1 });
    expect(summary.adherence).toBeCloseTo(10 / 11);
  });
});
