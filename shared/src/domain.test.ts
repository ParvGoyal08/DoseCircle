import { describe, expect, it } from "vitest";
import { doseSortKey, isDemoFamily, istDoseStamp, makeDoseId, parseDoseId } from "./keys.js";
import { preselectLanguage, FALLBACK_LANGUAGE, languageInfo } from "./languages.js";
import { dailyUse, daysLeft, decrementPills, shouldWarnRefill } from "./refill.js";
import { toCompactTime } from "./slots.js";
import { canClaim, canMarkTaken, reportOutcome, summariseAdherence, takenStatusFor } from "./status.js";
import { chooseLadder, FAST_LADDER, MIN_WAIT_SECONDS, scaleTimings, STANDARD_LADDER, timingsFor } from "./timings.js";

describe("timings", () => {
  it("chooses the fast ladder for critical medicines and repeat misses", () => {
    expect(chooseLadder({ critical: true, consecutiveMisses: 0 })).toBe("fast");
    expect(chooseLadder({ critical: false, consecutiveMisses: 1 })).toBe("fast");
    expect(chooseLadder({ critical: false, consecutiveMisses: 0 })).toBe("standard");
  });

  it("scales by speed, keeps zero as skip, and never goes below the minimum", () => {
    expect(timingsFor("standard", 60)).toEqual({ parentWaitSeconds: 20, nudgeWaitSeconds: 10, claimWaitSeconds: 15, finalWaitSeconds: 60 });
    expect(scaleTimings(FAST_LADDER, 600).nudgeWaitSeconds).toBe(0);
    expect(scaleTimings(STANDARD_LADDER, 10_000).parentWaitSeconds).toBe(MIN_WAIT_SECONDS);
    expect(() => scaleTimings(STANDARD_LADDER, 0)).toThrow();
  });
});

describe("dose status rules", () => {
  it("allows Taken from pending, escalating and claimed, and claims only while escalating", () => {
    expect(canMarkTaken("PENDING")).toBe(true);
    expect(canMarkTaken("CLAIMED")).toBe(true);
    expect(canMarkTaken("TAKEN")).toBe(false);
    expect(canClaim("ESCALATING")).toBe(true);
    expect(canClaim("CLAIMED")).toBe(false);
  });

  it("marks late only after escalation started", () => {
    expect(takenStatusFor("PENDING")).toBe("TAKEN");
    expect(takenStatusFor("ESCALATING")).toBe("TAKEN_LATE");
    expect(takenStatusFor("CLAIMED")).toBe("TAKEN_LATE");
  });

  it("never reports an offline phone as a missed dose", () => {
    expect(reportOutcome({ status: "UNRESOLVED", missClass: "OFFLINE" })).toBe("unknown");
    expect(reportOutcome({ status: "CLAIMED", missClass: "OFFLINE" })).toBe("unknown");
    expect(reportOutcome({ status: "UNRESOLVED", missClass: "MISSED" })).toBe("missed");
    expect(reportOutcome({ status: "ESCALATING" })).toBe("open");
    expect(reportOutcome({ status: "SKIPPED" })).toBe("excluded");
  });

  it("computes adherence without unknown, open or excluded doses", () => {
    const summary = summariseAdherence(["on_time", "on_time", "late", "missed", "unknown", "open", "excluded"]);
    expect(summary).toEqual({ onTime: 2, late: 1, missed: 1, unknown: 1, adherence: 0.75 });
    expect(summariseAdherence(["unknown"]).adherence).toBeNull();
  });
});

describe("refill", () => {
  it("counts only scheduled slots with known amounts", () => {
    expect(dailyUse({ slots: { morning: 1, night: 0.5 }, asNeeded: false })).toBe(1.5);
    expect(dailyUse({ slots: { morning: null }, asNeeded: false })).toBe(0);
    expect(dailyUse({ slots: { morning: 1 }, asNeeded: true })).toBe(0);
  });

  it("warns once at or below the threshold", () => {
    expect(daysLeft(6, 2)).toBe(3);
    expect(daysLeft(6, 0)).toBeNull();
    expect(shouldWarnRefill({ pillsLeft: 10, perDay: 2, thresholdDays: 5, alreadyAlerted: false })).toBe(true);
    expect(shouldWarnRefill({ pillsLeft: 12, perDay: 2, thresholdDays: 5, alreadyAlerted: false })).toBe(false);
    expect(shouldWarnRefill({ pillsLeft: 2, perDay: 2, thresholdDays: 5, alreadyAlerted: true })).toBe(false);
  });

  it("flags a recount when more pills were taken than recorded", () => {
    expect(decrementPills(5, 2)).toEqual({ pillsLeft: 3, needsRecount: false });
    expect(decrementPills(1, 2)).toEqual({ pillsLeft: 0, needsRecount: true });
  });
});

describe("keys", () => {
  it("builds dose stamps in Indian Standard Time", () => {
    // 02:30 UTC is 08:00 IST.
    expect(istDoseStamp(new Date("2026-09-17T02:30:00Z"))).toBe("202609170800");
    // 20:00 UTC is 01:30 IST the next day.
    expect(istDoseStamp(new Date("2026-09-17T20:00:00Z"))).toBe("202609180130");
  });

  it("round-trips dose ids including demo runs", () => {
    expect(parseDoseId(makeDoseId("p1", "202609170800"))).toEqual({ pid: "p1", doseStamp: "202609170800" });
    expect(parseDoseId(makeDoseId("p1", "202609170800", 3))).toEqual({ pid: "p1", doseStamp: "202609170800", demoRun: 3 });
    expect(doseSortKey("p1_202609170800_3")).toBe("DOSE#202609170800#3");
    expect(() => makeDoseId("p_1", "202609170800")).toThrow();
    expect(() => parseDoseId("p1_2026")).toThrow();
  });

  it("recognises demo families and compact times", () => {
    expect(isDemoFamily("demo-abc")).toBe(true);
    expect(isDemoFamily("fam-abc")).toBe(false);
    expect(toCompactTime("08:00")).toBe("0800");
    expect(() => toCompactTime("8:00")).toThrow();
  });
});

describe("languages", () => {
  it("falls back to English, never another Indian language", () => {
    expect(FALLBACK_LANGUAGE).toBe("en");
  });

  it("pre-selects only a shipped language the browser prefers", () => {
    expect(preselectLanguage(["kn-IN", "en-US"], ["kn", "hi", "en"])).toBe("kn");
    expect(preselectLanguage(["ta-IN"], ["kn", "hi", "en"])).toBeNull();
    expect(preselectLanguage(["en_GB"], ["kn", "en"])).toBe("en");
  });

  it("uses Polly only where AWS has an Indian voice", () => {
    expect(languageInfo("kn").pollyLanguageCode).toBeNull();
    expect(languageInfo("hi").pollyLanguageCode).toBe("hi-IN");
    expect(languageInfo("bn").fontFamily).toBe("Anek Bangla");
  });
});
