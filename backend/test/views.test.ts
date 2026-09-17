import { describe, expect, it } from "vitest";
import { ladderPosition, openAlerts, refillChips, weekStrip, type DashboardDoseInput } from "../src/views/dashboard.js";
import { buildTimeline } from "../src/views/timeline.js";
import { istDate } from "../src/scheduling/plan.js";

const dose = (overrides: Partial<DashboardDoseInput> & { doseId: string; scheduledAt: string }): DashboardDoseInput => ({
  pid: "p-1",
  slotName: "morning",
  status: "TAKEN",
  critical: false,
  ...overrides,
});

describe("dashboard", () => {
  it("builds a 7-day strip in IST with outcomes in time order", () => {
    const strip = weekStrip(
      [
        dose({ doseId: "b", scheduledAt: "2026-09-16T15:30:00Z", status: "UNRESOLVED", missClass: "OFFLINE" }), // 21:00 IST
        dose({ doseId: "a", scheduledAt: "2026-09-16T02:30:00Z" }), // 08:00 IST
        dose({ doseId: "c", scheduledAt: "2026-09-16T20:00:00Z", status: "TAKEN_LATE" }), // 01:30 IST on the 17th
      ],
      ["2026-09-16", "2026-09-17"],
      (iso) => istDate(new Date(iso)),
    );
    expect(strip).toEqual([
      { date: "2026-09-16", outcomes: ["on_time", "unknown"] },
      { date: "2026-09-17", outcomes: ["late"] },
    ]);
  });

  it("orders refill chips by urgency and flags recounts", () => {
    const chips = refillChips([
      { medId: "a", nameAsPrinted: "Telma 40", slots: { morning: 1 }, asNeeded: false, active: true, pillsLeft: 30, refillThresholdDays: 5 },
      { medId: "b", nameAsPrinted: "Glycomet GP 1", slots: { morning: 1, night: 1 }, asNeeded: false, active: true, pillsLeft: 3, refillThresholdDays: 5 },
      { medId: "c", nameAsPrinted: "Ecosprin", slots: { night: 1 }, asNeeded: false, active: true, pillsLeft: 0, refillThresholdDays: 5, needsRecount: true },
      { medId: "d", nameAsPrinted: "Crocin", slots: {}, asNeeded: true, active: true, pillsLeft: 10, refillThresholdDays: 5 },
    ]);
    expect(chips.map((c) => [c.nameAsPrinted, c.level, c.daysLeft])).toEqual([
      ["Ecosprin", "recount", 0],
      ["Glycomet GP 1", "critical", 1],
      ["Telma 40", "ok", 30],
    ]);
  });

  it("lists open alerts critical first and says whether the viewer may claim", () => {
    const alerts = openAlerts(
      [
        dose({ doseId: "x", scheduledAt: "2026-09-17T02:30:00Z", status: "ESCALATING", alertedMemberIds: ["m-1"] }),
        dose({ doseId: "y", scheduledAt: "2026-09-17T01:30:00Z", status: "ESCALATING", critical: true, alertedMemberIds: ["m-2"] }),
        dose({ doseId: "z", scheduledAt: "2026-09-17T00:30:00Z", status: "CLAIMED", claimedBy: "m-2" }),
        dose({ doseId: "done", scheduledAt: "2026-09-17T00:00:00Z", status: "TAKEN" }),
      ],
      "m-1",
      new Map([["p-1", "Amma"]]),
      new Map([["m-2", "Meera"]]),
    );
    expect(alerts.map((a) => [a.doseId, a.alertedMe, a.claimedByName])).toEqual([
      ["y", false, null],
      ["x", true, null],
      ["z", false, "Meera"],
    ]);
  });

  it("gives a 1-based ladder position", () => {
    expect(ladderPosition(["m-a", "m-b"], "m-b")).toBe(2);
    expect(ladderPosition(["m-a"], "m-z")).toBeNull();
  });
});

describe("timeline", () => {
  const names = new Map([
    ["m-arjun", "Arjun"],
    ["m-meera", "Meera"],
  ]);

  it("tells the story of a dose that reached the phone, was missed, and was claimed", () => {
    const items = buildTimeline(
      [
        { type: "REMINDER_SENT", at: "2026-09-17T02:30:01Z" },
        { type: "DELIVERED", at: "2026-09-17T02:30:03Z", detail: { step: "REMIND", recipient: "dev-1" } },
        { type: "NUDGE_SENT", at: "2026-09-17T02:50:01Z" },
        { type: "MEMBER_ALERTED", at: "2026-09-17T03:00:02Z", detail: { memberIds: ["m-arjun"], missClass: "MISSED" } },
        { type: "DELIVERED", at: "2026-09-17T03:00:04Z", detail: { step: "ALERT", recipient: "m-arjun" } },
        { type: "MEMBER_ALERTED", at: "2026-09-17T03:15:02Z", detail: { memberIds: ["m-meera"], missClass: "MISSED" } },
        { type: "CLAIMED", at: "2026-09-17T03:16:00Z", detail: { memberId: "m-meera", authorizedBy: ["only-alerted-members-can-claim"] } },
        { type: "STAND_DOWN_SENT", at: "2026-09-17T03:16:01Z", detail: { outcome: "CLAIMED" } },
      ],
      [
        { type: "TaskStateEntered", timestamp: "2026-09-17T02:30:00Z", stateName: "RemindParent" },
        { type: "TaskTimedOut", timestamp: "2026-09-17T02:50:00Z" },
        { type: "TaskStateEntered", timestamp: "2026-09-17T02:50:00Z", stateName: "NudgeParent" },
        { type: "TaskTimedOut", timestamp: "2026-09-17T03:00:00Z" },
        { type: "PassStateEntered", timestamp: "2026-09-17T03:00:01Z", stateName: "MarkLikelyMissed" },
      ],
      names,
      "Amma",
    );

    expect(items.map((i) => [i.kind, i.stateName ?? null, i.people ?? null, i.sincePreviousSeconds])).toEqual([
      ["reminder_sent", "RemindParent", null, null],
      ["reached_phone", null, ["Amma"], 2],
      ["no_confirmation", "RemindParent", null, 1197],
      ["nudge_sent", "NudgeParent", null, 1],
      ["no_confirmation", "NudgeParent", null, 599],
      ["reminder_reached_phone", "WasReminderDelivered", null, 1],
      ["member_alerted", "AlertFamilyMember", ["Arjun"], 1],
      ["member_alerted", "AlertFamilyMember", ["Meera"], 900],
      ["claimed", null, ["Meera"], 58],
      ["others_stood_down", "TellOthersToStandDown", null, 1],
    ]);
    expect(items.find((i) => i.kind === "claimed")?.authorizedBy).toEqual(["only-alerted-members-can-claim"]);
  });

  it("shows an offline phone and a late confirmation", () => {
    const items = buildTimeline(
      [
        { type: "REMINDER_SENT", at: "2026-09-17T15:30:01Z" },
        { type: "FAMILY_ALERTED", at: "2026-09-17T15:41:00Z", detail: { memberIds: ["m-arjun", "m-meera"] } },
        { type: "TAKEN", at: "2026-09-17T15:45:00Z" },
        { type: "STAND_DOWN_SENT", at: "2026-09-17T15:45:01Z", detail: { outcome: "TAKEN" } },
      ],
      [{ type: "PassStateEntered", timestamp: "2026-09-17T15:40:01Z", stateName: "MarkPhoneOffline" }],
      names,
      "Amma",
    );
    expect(items.map((i) => i.kind)).toEqual(["reminder_sent", "phone_seemed_offline", "family_alerted", "taken", "family_told_taken"]);
    expect(items[2]?.people).toEqual(["Arjun", "Meera"]);
  });
});
