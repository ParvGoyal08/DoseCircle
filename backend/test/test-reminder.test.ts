import type { PlannedCheck } from "@dosecircle/shared";
import { describe, expect, it } from "vitest";
import { testReminderSlot } from "../src/api/family/test-reminder.js";
import type { PlannedMedicine } from "../src/scheduling/plan.js";

// 10:00 IST on a Thursday.
const NOW = new Date("2026-09-17T04:30:00Z");
const med = (o: Partial<PlannedMedicine> & { medId: string }): PlannedMedicine => ({ slots: {}, critical: false, asNeeded: false, active: true, ...o });
const check = (o: Partial<PlannedCheck> & { checkId: string }): PlannedCheck => ({ type: "glucose", slots: [], escalates: true, active: true, ...o });
const morning = { slotName: "morning" as const, medIds: ["a"], checkIds: [] as string[] };
const night = { slotName: "night" as const, medIds: ["b"], checkIds: [] as string[] };
const ready = { paused: false, slots: [morning], medicines: [med({ medId: "a", slots: { morning: 1 } })], checks: [], phones: 1, subscribed: true, now: NOW };

describe("test reminder", () => {
  it("uses the first slot with something due", () => {
    expect(testReminderSlot(ready)).toEqual({ slot: morning });
  });

  it("says there are no medicines instead of doing nothing", () => {
    expect(testReminderSlot({ ...ready, slots: [], medicines: [] })).toMatchObject({ reason: "no_medicines", status: 400 });
  });

  it("refuses when nothing is due today, rather than starting a dose the workflow will skip", () => {
    const ended = med({ medId: "a", slots: { morning: 1 }, endDate: "2026-09-16" });
    expect(testReminderSlot({ ...ready, medicines: [ended] })).toMatchObject({ reason: "nothing_due" });
    const stopped = med({ medId: "a", slots: { morning: 1 }, active: false });
    expect(testReminderSlot({ ...ready, medicines: [stopped] })).toMatchObject({ reason: "nothing_due" });
  });

  it("skips a slot with nothing due and uses the next one that has", () => {
    const medicines = [med({ medId: "a", slots: { morning: 1 }, endDate: "2026-09-01" }), med({ medId: "b", slots: { night: 1 } })];
    expect(testReminderSlot({ ...ready, slots: [morning, night], medicines })).toEqual({ slot: night });
  });

  it("counts a daily check that is due as something to remind about", () => {
    const withCheck = { slotName: "morning" as const, medIds: [], checkIds: ["c"] };
    expect(testReminderSlot({ ...ready, slots: [withCheck], medicines: [], checks: [check({ checkId: "c", slots: ["morning"] })] })).toEqual({ slot: withCheck });
    // Thursday is weekday 4; a Sunday-only check is not due.
    expect(testReminderSlot({ ...ready, slots: [withCheck], medicines: [], checks: [check({ checkId: "c", slots: ["morning"], weekdays: [0] })] })).toMatchObject({ reason: "nothing_due" });
  });

  it("says when reminders are paused, before anything else", () => {
    expect(testReminderSlot({ ...ready, paused: true, slots: [] })).toMatchObject({ reason: "paused", status: 409 });
  });

  it("says when their phone is not connected, or never allowed notifications", () => {
    expect(testReminderSlot({ ...ready, phones: 0, subscribed: false })).toMatchObject({ reason: "no_phone" });
    expect(testReminderSlot({ ...ready, subscribed: false })).toMatchObject({ reason: "no_notifications" });
  });

  it("honours a requested time of day", () => {
    const medicines = [med({ medId: "a", slots: { morning: 1 } }), med({ medId: "b", slots: { night: 1 } })];
    expect(testReminderSlot({ ...ready, slots: [morning, night], medicines, slotName: "night" })).toEqual({ slot: night });
  });
});
