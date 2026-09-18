import { DEFAULT_SLOT_TIMES, istDoseStamp, keys, makeDoseId, roundReading, type DoseStatus, type LanguageCode, type MissClass, type SlotName } from "@dosecircle/shared";
import type { CheckItem, DoseItem, FamilyItem, MedicineItem, MemberItem, ParentItem, ReadingItem, SlotItem } from "../lib/model.js";

/**
 * The fictional demo family. Every name here is invented. A Kannada-speaking mother in Mysuru, her
 * son in Bengaluru (English) and her daughter in Pune (Hindi), so the demo shows each person using
 * the app in their own language.
 */
export const DEMO_PEOPLE = {
  parent: { displayName: "Shantha", lang: "kn" as LanguageCode, city: "Mysuru" },
  son: { displayName: "Arjun", relation: "Son", lang: "en" as LanguageCode, city: "Bengaluru" },
  daughter: { displayName: "Meera", relation: "Daughter", lang: "hi" as LanguageCode, city: "Pune" },
};

// Built once: a formatter per call holds native ICU memory that V8 will not collect in time.
const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const HISTORY_DAYS = 30;

/** Small deterministic generator (mulberry32) so the demo history is identical every time. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DoseStory {
  status: DoseStatus;
  missClass?: MissClass;
  offline?: boolean;
  /** Minutes after the reminder that Taken was tapped. */
  takenAfter?: number;
  alerted?: ("son" | "daughter")[];
  claimedBy?: "son" | "daughter";
  /** Minutes after escalation that the claim came in. */
  claimAfter?: number;
}

function storyFor(dayOffset: number, slot: "morning" | "night", random: () => number): DoseStory {
  const jitter = (min: number, max: number) => Math.round(min + random() * (max - min));
  // Specific days that give the charts something to say.
  if (slot === "morning" && dayOffset === 26) return { status: "UNRESOLVED", missClass: "MISSED", alerted: ["son", "daughter"] };
  if (slot === "night" && dayOffset === 23) return { status: "CLAIMED", missClass: "OFFLINE", offline: true, alerted: ["son"], claimedBy: "son", claimAfter: 4 };
  if (slot === "night" && dayOffset === 16) return { status: "CLAIMED", missClass: "MISSED", alerted: ["son", "daughter"], claimedBy: "daughter", claimAfter: 19 };
  if (slot === "morning" && dayOffset === 12) return { status: "TAKEN_LATE", missClass: "MISSED", takenAfter: 41, alerted: ["son"] };
  if (slot === "night" && dayOffset === 9) return { status: "CLAIMED", missClass: "MISSED", alerted: ["son"], claimedBy: "son", claimAfter: 6 };
  if (slot === "morning" && dayOffset === 5) return { status: "CLAIMED", missClass: "OFFLINE", offline: true, alerted: ["son", "daughter"], claimedBy: "daughter", claimAfter: 17 };
  // Evenings slip in the last week.
  if (slot === "night" && dayOffset <= 7) {
    if (dayOffset === 6 || dayOffset === 3) return { status: "CLAIMED", missClass: "MISSED", alerted: ["son"], claimedBy: "son", claimAfter: jitter(4, 9) };
    if (dayOffset === 2) return { status: "TAKEN_LATE", missClass: "MISSED", takenAfter: jitter(35, 48), alerted: ["son"] };
    return { status: "TAKEN", takenAfter: jitter(12, 19) };
  }
  // Otherwise steady: mornings a few minutes after the reminder, nights a little later.
  return { status: "TAKEN", takenAfter: slot === "morning" ? jitter(1, 9) : jitter(3, 14) };
}

export interface DemoSeed {
  fid: string;
  pid: string;
  sonId: string;
  daughterId: string;
  items: Record<string, unknown>[];
}

/** Everything the demo needs, with a TTL so it disappears on its own. */
export function buildDemoSeed(input: { sid: string; now: number; ttl: number }): DemoSeed {
  const suffix = input.sid.replace(/^s-/, "");
  const fid = `demo-${suffix}`;
  const pid = `p-demo${suffix}`;
  const sonId = `m-son${suffix}`;
  const daughterId = `m-dtr${suffix}`;
  const ttl = input.ttl;

  const family: FamilyItem = { ...keys.family(fid), fid, name: "Shantha's family (demo)", createdAt: new Date(input.now).toISOString(), ttl };
  const members: MemberItem[] = [
    { ...keys.member(fid, sonId), fid, mid: sonId, displayName: DEMO_PEOPLE.son.displayName, relation: DEMO_PEOPLE.son.relation, role: "owner", lang: DEMO_PEOPLE.son.lang, ttl },
    { ...keys.member(fid, daughterId), fid, mid: daughterId, displayName: DEMO_PEOPLE.daughter.displayName, relation: DEMO_PEOPLE.daughter.relation, role: "member", lang: DEMO_PEOPLE.daughter.lang, ttl },
  ];
  const parent: ParentItem = {
    ...keys.parent(fid, pid),
    fid,
    pid,
    displayName: DEMO_PEOPLE.parent.displayName,
    lang: DEMO_PEOPLE.parent.lang,
    ladder: [sonId, daughterId],
    consecutiveMisses: 0,
    paused: false,
    slotTimes: { ...DEFAULT_SLOT_TIMES },
    lastReceiptAt: new Date(input.now - 13 * HOUR).toISOString(),
    ttl,
  };

  const medicine = (medId: string, fields: Omit<MedicineItem, "PK" | "SK" | "pid" | "medId" | "active" | "refillThresholdDays"> & { refillThresholdDays?: number }): MedicineItem => ({
    ...keys.medicine(pid, medId),
    pid,
    medId,
    active: true,
    refillThresholdDays: 5,
    ttl,
    ...fields,
  });
  const medicines: MedicineItem[] = [
    // 6 tablets at 2 a day: the refill warning fires on the first confirmed dose.
    medicine("med-glycomet", { nameAsPrinted: "Glycomet GP 1", strength: null, slots: { morning: 1, night: 1 }, food: "after", critical: false, asNeeded: false, pillsLeft: 6 }),
    medicine("med-telma", { nameAsPrinted: "Telma 40", strength: "40 mg", slots: { morning: 1 }, food: null, critical: false, asNeeded: false, pillsLeft: 24 }),
    medicine("med-lantus", { nameAsPrinted: "Lantus", strength: "10 units", slots: { night: 1 }, food: null, critical: true, asNeeded: false, pillsLeft: null }),
  ];

  // Daily checks: blood sugar and blood pressure every morning (the family asked to be told if one
  // is forgotten), and a weekly weigh-in on Sundays that stays quiet.
  const check = (checkId: string, fields: Omit<CheckItem, "PK" | "SK" | "pid" | "checkId" | "active" | "createdAt" | "createdBy">): CheckItem => ({
    ...keys.check(pid, checkId),
    pid,
    checkId,
    active: true,
    createdAt: new Date(input.now - HISTORY_DAYS * DAY).toISOString(),
    createdBy: sonId,
    ttl,
    ...fields,
  });
  const checks: CheckItem[] = [
    check("chk-sugar", { type: "glucose", slots: ["morning"], weekdays: [], escalates: true, ttl }),
    check("chk-bp", { type: "bp", slots: ["morning"], weekdays: [], escalates: true, ttl }),
    check("chk-weight", { type: "weight", slots: ["morning"], weekdays: [0], escalates: false, ttl }),
  ];

  const slot = (slotName: SlotName, compactTime: string, medIds: string[], checkIds: string[], critical: boolean): SlotItem => ({
    ...keys.slot(pid, compactTime),
    pid,
    compactTime,
    slotName,
    medIds,
    checkIds,
    critical,
    ttl,
  });
  const slots = [
    slot("morning", "0800", ["med-glycomet", "med-telma"], ["chk-sugar", "chk-bp", "chk-weight"], false),
    slot("night", "2100", ["med-glycomet", "med-lantus"], [], true),
  ];

  // Thirty past days, so every chart on the dashboard and the doctor report tells a believable story:
  // mornings are steady, evening doses slip in the last week, the phone is offline twice, and both
  // children have stepped in. The pattern is fixed (not random) so every demo and video looks the same.
  const history: DoseItem[] = [];
  const random = seeded(20260917);
  for (let dayOffset = HISTORY_DAYS; dayOffset >= 1; dayOffset--) {
    for (const { slotName, hour, medIds, critical } of [
      { slotName: "morning" as const, hour: 8, medIds: ["med-glycomet", "med-telma"], critical: false },
      { slotName: "night" as const, hour: 21, medIds: ["med-glycomet", "med-lantus"], critical: true },
    ]) {
      const scheduledMs = istTime(input.now - dayOffset * DAY, hour);
      const scheduledAt = new Date(scheduledMs).toISOString();
      const stamp = istDoseStamp(new Date(scheduledMs));
      const at = (minutes: number) => new Date(scheduledMs + minutes * 60_000).toISOString();
      const story = storyFor(dayOffset, slotName, random);
      const escalatedAt = at(30);
      history.push({
        ...keys.dose(pid, stamp),
        doseId: makeDoseId(pid, stamp),
        fid,
        pid,
        slotName,
        medIds,
        critical,
        scheduledAt,
        executionArn: "",
        channel: "inbox",
        ttl,
        status: story.status,
        ...(story.missClass ? { missClass: story.missClass } : {}),
        ...(story.offline ? {} : { deliveredAt: at(0.05) }),
        ...(story.takenAfter !== undefined ? { takenAt: at(story.takenAfter) } : {}),
        ...(story.status !== "TAKEN" ? { escalatedAt } : {}),
        ...(story.alerted ? { alertedMemberIds: new Set(story.alerted.map((who) => (who === "son" ? sonId : daughterId))) } : {}),
        ...(story.claimedBy ? { claimedBy: story.claimedBy === "son" ? sonId : daughterId, claimedAt: at(30 + (story.claimAfter ?? 5)) } : {}),
      });
    }
  }

  // Readings for the morning checks, from a separate seeded stream so adding or changing a check can
  // never shift the dose history. The numbers drift gently and are never interpreted anywhere in the
  // app: they exist so the trend panels and the doctor report have something real-looking to draw.
  const readings: ReadingItem[] = [];
  const readingRandom = seeded(20260918);
  for (let dayOffset = HISTORY_DAYS; dayOffset >= 1; dayOffset--) {
    const scheduledMs = istTime(input.now - dayOffset * DAY, 8);
    const doseStamp = istDoseStamp(new Date(scheduledMs));
    const doseId = makeDoseId(pid, doseStamp);
    // A morning nobody ever confirmed has no reading either: that is what makes "written down on
    // 26 of 30 days" an honest number rather than a decoration.
    const morningDose = history.find((d) => d.doseId === doseId);
    if (morningDose?.status === "UNRESOLVED" || readingRandom() <= 0.1) continue;
    const at = new Date(scheduledMs + Math.round(5 + readingRandom() * 25) * 60_000).toISOString();
    const reading = (checkId: string, type: ReadingItem["type"], values: Record<string, number>): ReadingItem => ({
      ...keys.reading(pid, at, checkId),
      pid,
      checkId,
      type,
      values: roundReading(type, values),
      at,
      doseId,
      recordedBy: { kind: "parent", id: `parent-${pid}` },
      ttl,
    });

    const wobble = (spread: number) => (readingRandom() - 0.5) * spread;
    // Fasting sugar easing down over the month, blood pressure steady with the odd higher morning.
    readings.push(reading("chk-sugar", "glucose", { glucose: 108 + dayOffset * 0.9 + wobble(14) }));
    readings.push(reading("chk-bp", "bp", { systolic: 128 + wobble(16), diastolic: 80 + wobble(8), pulse: 74 + wobble(10) }));
    // The Sunday weigh-in only. 08:00 IST is 02:30 UTC the same day, so the UTC weekday is the Indian one.
    if (new Date(scheduledMs).getUTCDay() === 0) readings.push(reading("chk-weight", "weight", { weight: 61.5 + dayOffset * 0.04 + wobble(0.5) }));
  }

  return {
    fid,
    pid,
    sonId,
    daughterId,
    items: [family, ...members, parent, ...medicines, ...checks, ...slots, ...history, ...readings] as unknown as Record<string, unknown>[],
  };
}

/** Epoch ms for hour:00 IST on the Indian day containing `epochMs`. */
export function istTime(epochMs: number, hour: number): number {
  const date = IST_DAY.format(new Date(epochMs));
  return Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+05:30`);
}
