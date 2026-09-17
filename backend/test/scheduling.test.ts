import { DEFAULT_SLOT_TIMES } from "@dosecircle/shared";
import { describe, expect, it } from "vitest";
import { dailyCron, desiredSlots, diffSlots, istDate, scheduleName, type PlannedMedicine } from "../src/scheduling/plan.js";

const med = (overrides: Partial<PlannedMedicine> & { medId: string }): PlannedMedicine => ({
  slots: {},
  critical: false,
  asNeeded: false,
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
      DEFAULT_SLOT_TIMES,
      "2026-09-17",
    );
    expect(slots).toEqual([
      { compactTime: "0800", slotName: "morning", medIds: ["metformin", "telma"], critical: false },
      { compactTime: "2100", slotName: "night", medIds: ["insulin", "metformin"], critical: true },
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
      { ...DEFAULT_SLOT_TIMES, evening: "19:30" },
      "2026-09-17",
    );
    expect(slots).toEqual([{ compactTime: "1930", slotName: "evening", medIds: ["last-day"], critical: false }]);
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
        { compactTime: "0800", slotName: "morning", medIds: ["a", "c"], critical: false },
        { compactTime: "2100", slotName: "night", medIds: ["d"], critical: true },
      ],
    );
    expect(changes.create.map((s) => s.compactTime)).toEqual(["2100"]);
    expect(changes.update.map((s) => s.compactTime)).toEqual(["0800"]);
    expect(changes.remove.map((s) => s.compactTime)).toEqual(["1300"]);
  });

  it("does nothing when nothing changed", () => {
    const slot = { compactTime: "0800", slotName: "morning" as const, medIds: ["a"], critical: false };
    expect(diffSlots([slot], [slot])).toEqual({ create: [], update: [], remove: [] });
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
});
