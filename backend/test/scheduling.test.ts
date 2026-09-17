import { DEFAULT_SLOT_TIMES, type PlannedCheck } from "@dosecircle/shared";
import { describe, expect, it } from "vitest";
import { type PlannedMedicine, dailyCron, desiredSlots, diffSlots, isDueAt, istDate, istWeekday, scheduleName } from "../src/scheduling/plan.js";

const med = (overrides: Partial<PlannedMedicine> & { medId: string }): PlannedMedicine => ({
  slots: {},
  critical: false,
  asNeeded: false,
  active: true,
  ...overrides,
});

const check = (overrides: Partial<PlannedCheck> & { checkId: string }): PlannedCheck => ({
  type: "glucose",
  slots: [],
  escalates: true,
  active: true,
  ...overrides,
});

describe("desiredSlots", () => {
  it("groups medicines by time of day and marks a slot critical if any medicine is", () => {
    const slots = desiredSlots(
      [
        med({ medId: "metformin", slots: { morning: 1, night: 1 } }),
        med({ medId: "telma", slots: { morning: 1 } }),
        med({ medId: "insulin", slots: { night: 1 }, critical: true }),
      ],
      [],
      DEFAULT_SLOT_TIMES,
      "2026-09-17",
    );
    expect(slots).toEqual([
      { compactTime: "0800", slotName: "morning", medIds: ["metformin", "telma"], checkIds: [], critical: false },
      { compactTime: "2100", slotName: "night", medIds: ["insulin", "metformin"], checkIds: [], critical: true },
    ]);
  });

  it("skips inactive, as-needed, finished and unscheduled medicines", () => {
    const slots = desiredSlots(
      [
        med({ medId: "stopped", slots: { morning: 1 }, active: false }),
        med({ medId: "sos", slots: { morning: 1 }, asNeeded: true }),
        med({ medId: "course", slots: { morning: 1 }, endDate: "2026-09-16" }),
        med({ medId: "unknown-amount", slots: { morning: null } }),
        med({ medId: "last-day", slots: { evening: 1 }, endDate: "2026-09-17" }),
      ],
      [],
      { ...DEFAULT_SLOT_TIMES, evening: "19:30" },
      "2026-09-17",
    );
    expect(slots).toEqual([{ compactTime: "1930", slotName: "evening", medIds: ["last-day"], checkIds: [], critical: false }]);
  });

  it("gives a check-only time of day its own reminder", () => {
    const slots = desiredSlots([], [check({ checkId: "sugar", slots: ["morning"] })], DEFAULT_SLOT_TIMES, "2026-09-17");
    expect(slots).toEqual([{ compactTime: "0800", slotName: "morning", medIds: [], checkIds: ["sugar"], critical: false }]);
  });

  it("keeps a daily schedule for a check asked for on some weekdays only, and drops stopped ones", () => {
    const slots = desiredSlots(
      [],
      [
        check({ checkId: "weight", type: "weight", slots: ["morning"], weekdays: [0], escalates: false }),
        check({ checkId: "stopped", slots: ["morning"], active: false }),
        check({ checkId: "finished", slots: ["morning"], endDate: "2026-09-16" }),
      ],
      DEFAULT_SLOT_TIMES,
      "2026-09-17",
    );
    // The weekday is decided when the dose is prepared, so the schedule itself stays daily.
    expect(slots).toEqual([{ compactTime: "0800", slotName: "morning", medIds: [], checkIds: ["weight"], critical: false }]);
  });
});

describe("diffSlots", () => {
  it("creates new times, updates changed ones and removes the rest", () => {
    const changes = diffSlots(
      [
        { compactTime: "0800", slotName: "morning", medIds: ["a"], critical: false },
        { compactTime: "1300", slotName: "afternoon", medIds: ["b"], critical: false },
      ],
      [
        { compactTime: "0800", slotName: "morning", medIds: ["a", "c"], checkIds: [], critical: false },
        { compactTime: "2100", slotName: "night", medIds: ["d"], checkIds: [], critical: true },
      ],
    );
    expect(changes.create.map((s) => s.compactTime)).toEqual(["2100"]);
    expect(changes.update.map((s) => s.compactTime)).toEqual(["0800"]);
    expect(changes.remove.map((s) => s.compactTime)).toEqual(["1300"]);
  });

  it("does nothing when nothing changed", () => {
    const slot = { compactTime: "0800", slotName: "morning" as const, medIds: ["a"], checkIds: ["sugar"], critical: false };
    expect(diffSlots([slot], [slot])).toEqual({ create: [], update: [], remove: [] });
  });

  it("updates a time of day when only its checks changed", () => {
    const changes = diffSlots(
      [{ compactTime: "0800", slotName: "morning", medIds: ["a"], critical: false }],
      [{ compactTime: "0800", slotName: "morning", medIds: ["a"], checkIds: ["sugar"], critical: false }],
    );
    expect(changes.update.map((s) => s.compactTime)).toEqual(["0800"]);
  });
});

describe("schedule details", () => {
  it("builds daily crons and valid names", () => {
    expect(dailyCron("0830")).toBe("cron(30 8 * * ? *)");
    expect(dailyCron("2100")).toBe("cron(0 21 * * ? *)");
    expect(scheduleName("p-1a2b3c4d5e6f", "0800")).toBe("dose-p-1a2b3c4d5e6f-0800");
    expect(() => scheduleName("p".repeat(60), "0800")).toThrow();
  });

  it("uses the Indian date, not UTC", () => {
    // 20:00 UTC on the 17th is already the 18th in India.
    expect(istDate(new Date("2026-09-17T20:00:00Z"))).toBe("2026-09-18");
  });

  it("uses the Indian weekday, not UTC", () => {
    // Thursday 20:00 UTC is already Friday in India.
    expect(istWeekday(new Date("2026-09-17T20:00:00Z"))).toBe(5);
    expect(istWeekday(new Date("2026-09-17T10:00:00Z"))).toBe(4);
  });
});

describe("medicines that have finished", () => {
  const medicine = { medId: "m1", slots: { morning: 1 }, critical: false, asNeeded: false, active: true };

  it("stops being due after its last day", () => {
    expect(isDueAt({ ...medicine, endDate: "2026-09-20" }, "morning", "2026-09-20")).toBe(true);
    expect(isDueAt({ ...medicine, endDate: "2026-09-19" }, "morning", "2026-09-20")).toBe(false);
  });

  it("is never due when stopped, as-needed, or not in this slot", () => {
    expect(isDueAt({ ...medicine, active: false }, "morning", "2026-09-20")).toBe(false);
    expect(isDueAt({ ...medicine, asNeeded: true }, "morning", "2026-09-20")).toBe(false);
    expect(isDueAt(medicine, "night", "2026-09-20")).toBe(false);
  });
});
