import { DEFAULT_SLOT_TIMES, istDoseStamp, keys, makeDoseId, type DoseStatus, type LanguageCode, type MissClass, type SlotName } from "@dosecircle/shared";
import type { DoseItem, FamilyItem, MedicineItem, MemberItem, ParentItem, SlotItem } from "../lib/model.js";

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

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

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

  const slot = (slotName: SlotName, compactTime: string, medIds: string[], critical: boolean): SlotItem => ({ ...keys.slot(pid, compactTime), pid, compactTime, slotName, medIds, critical, ttl });
  const slots = [slot("morning", "0800", ["med-glycomet", "med-telma"], false), slot("night", "2100", ["med-glycomet", "med-lantus"], true)];

  // Six past days, so the week strip and doctor report have a believable story.
  const history: DoseItem[] = [];
  const pastOutcome = (dayOffset: number, slotName: SlotName): { status: DoseStatus; missClass?: MissClass; claimedBy?: string } => {
    if (dayOffset === 5 && slotName === "morning") return { status: "UNRESOLVED", missClass: "MISSED" };
    if (dayOffset === 4 && slotName === "night") return { status: "CLAIMED", missClass: "OFFLINE", claimedBy: sonId };
    if (dayOffset === 2 && slotName === "morning") return { status: "TAKEN_LATE", missClass: "MISSED", claimedBy: daughterId };
    return { status: "TAKEN" };
  };
  for (let dayOffset = 6; dayOffset >= 1; dayOffset--) {
    for (const { slotName, hour, medIds, critical } of [
      { slotName: "morning" as const, hour: 8, medIds: ["med-glycomet", "med-telma"], critical: false },
      { slotName: "night" as const, hour: 21, medIds: ["med-glycomet", "med-lantus"], critical: true },
    ]) {
      const scheduled = istTime(input.now - dayOffset * DAY, hour);
      const doseId = makeDoseId(pid, istDoseStamp(new Date(scheduled)));
      history.push({
        ...keys.dose(pid, istDoseStamp(new Date(scheduled))),
        doseId,
        fid,
        pid,
        slotName,
        medIds,
        critical,
        scheduledAt: new Date(scheduled).toISOString(),
        executionArn: "",
        channel: "inbox",
        ttl,
        ...pastOutcome(dayOffset, slotName),
      });
    }
  }

  return { fid, pid, sonId, daughterId, items: [family, ...members, parent, ...medicines, ...slots, ...history] as unknown as Record<string, unknown>[] };
}

/** Epoch ms for hour:00 IST on the Indian day containing `epochMs`. */
export function istTime(epochMs: number, hour: number): number {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(epochMs));
  return Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+05:30`);
}
