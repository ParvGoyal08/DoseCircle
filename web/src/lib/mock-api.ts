import { SLOT_NAMES, type LanguageCode, type SlotName } from "@dosecircle/shared";
import { ApiError } from "./api";
import type { Dashboard, DoseView, MedicineInput, MedicineLine, MedicineView, Me, OpenAlert, ParentCard, ParentToday, Prescription, Report, Timeline, TimelineItem } from "./types";

/**
 * Development only: a small in-memory backend so every screen and button can be used without AWS.
 * It is loaded through a dynamic import guarded by import.meta.env.DEV, so it never ships.
 * State lasts for the browser tab, across reloads; close the tab to start again.
 */

const MIN = 60_000;
const now = () => Date.now();
const iso = (minutesAgo: number) => new Date(now() - minutesAgo * MIN).toISOString();
const istDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ms));

let nextId = 1;
const id = (prefix: string) => `${prefix}-mock${nextId++}`;

interface Store {
  signedIn: boolean;
  hasFamily: boolean;
  me: { fid: string; mid: string; displayName: string; relation: string | null; role: "owner" | "member"; lang: LanguageCode };
  members: Dashboard["members"];
  parent: Omit<ParentCard, "today" | "week" | "refills" | "slots" | "myLadderPosition">;
  medicines: MedicineView[];
  dose: { doseId: string; slotName: SlotName; scheduledAt: string; status: DoseView["status"]; missClass: "MISSED" | "OFFLINE" | null; claimedBy: string | null; alerted: string[] };
  timeline: Omit<TimelineItem, "sincePreviousSeconds">[];
  devices: { deviceId: string; pairedAt: string | null; lang: LanguageCode }[];
  testDosesToday: number;
  prescriptions: Record<string, { pid: string; confirmed: boolean }>;
}

function initialStore(): Store {
  const scheduledAt = iso(34);
  return {
    signedIn: true,
    hasFamily: true,
    me: { fid: "fam-mock", mid: "m-son", displayName: "Arjun", relation: "Son", role: "owner", lang: "en" },
    members: [
      { mid: "m-son", displayName: "Arjun", relation: "Son", role: "owner", lang: "en" },
      { mid: "m-daughter", displayName: "Meera", relation: "Daughter", role: "member", lang: "hi" },
    ],
    parent: {
      pid: "p-demo",
      displayName: "Shantha",
      lang: "kn",
      paused: false,
      slotTimes: { morning: "08:00", afternoon: "13:00", evening: "18:00", night: "21:00" },
      lastReceiptAt: iso(26),
      ladder: [
        { mid: "m-son", displayName: "Arjun" },
        { mid: "m-daughter", displayName: "Meera" },
      ],
    },
    medicines: [
      { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, slots: { morning: 1, night: 1 }, food: "after", critical: false, asNeeded: false, pillsLeft: 6, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
      { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", slots: { morning: 1 }, food: null, critical: false, asNeeded: false, pillsLeft: 24, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
      { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", slots: { night: 1 }, food: null, critical: true, asNeeded: false, pillsLeft: null, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
    ],
    dose: { doseId: "p-demo_mock_morning", slotName: "morning", scheduledAt, status: "ESCALATING", missClass: "MISSED", claimedBy: null, alerted: ["m-son"] },
    timeline: [
      { at: iso(34), kind: "reminder_sent", stateName: "RemindParent" },
      { at: iso(34), kind: "reached_phone", people: ["Shantha"] },
      { at: iso(14), kind: "no_confirmation", stateName: "RemindParent" },
      { at: iso(14), kind: "nudge_sent", stateName: "NudgeParent" },
      { at: iso(4), kind: "no_confirmation", stateName: "NudgeParent" },
      { at: iso(4), kind: "reminder_reached_phone", stateName: "WasReminderDelivered" },
      { at: iso(4), kind: "member_alerted", stateName: "AlertFamilyMember", people: ["Arjun"] },
    ],
    devices: [{ deviceId: "dev-mock1", pairedAt: iso(60 * 24 * 3), lang: "kn" }],
    testDosesToday: 0,
    prescriptions: {},
  };
}

const STORE_KEY = "dosecircle.mock.store";
let store: Store | null = null;
const db = (): Store => {
  if (store) return store;
  try {
    const saved = sessionStorage.getItem(STORE_KEY);
    if (saved) store = JSON.parse(saved) as Store;
  } catch {
    store = null;
  }
  return (store ??= initialStore());
};
const persist = () => {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: state lasts until the page reloads.
  }
};

export function mockSignIn() {
  db().signedIn = true;
  persist();
}
export function mockSignOut() {
  db().signedIn = false;
  persist();
}

const nameOf = (mid: string) => db().members.find((m) => m.mid === mid)?.displayName ?? "";

function medicineLine(m: MedicineView, slot: SlotName): MedicineLine {
  return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, strength: m.strength, count: m.slots[slot] ?? null, food: m.food, critical: m.critical };
}

function slotsInUse(): SlotName[] {
  return SLOT_NAMES.filter((slot) => db().medicines.some((m) => m.active && !m.asNeeded && (m.slots[slot] ?? 0) > 0));
}

function doseView(): DoseView {
  const s = db();
  return {
    doseId: s.dose.doseId,
    status: s.dose.status,
    slotName: s.dose.slotName,
    scheduledAt: s.dose.scheduledAt,
    critical: s.medicines.some((m) => m.active && m.critical && (m.slots[s.dose.slotName] ?? 0) > 0),
    parent: { displayName: s.parent.displayName, lang: s.parent.lang },
    medicines: s.medicines.filter((m) => m.active && (m.slots[s.dose.slotName] ?? 0) > 0).map((m) => medicineLine(m, s.dose.slotName)),
    voice: { src: `/audio/${s.parent.lang}/remind_${s.dose.slotName}.mp3`, thanks: `/audio/${s.parent.lang}/taken_thanks.mp3` },
  };
}

function openAlerts(): OpenAlert[] {
  const s = db();
  if (s.dose.status !== "ESCALATING" && s.dose.status !== "CLAIMED") return [];
  return [
    {
      doseId: s.dose.doseId,
      pid: s.parent.pid,
      parentName: s.parent.displayName,
      slotName: s.dose.slotName,
      scheduledAt: s.dose.scheduledAt,
      status: s.dose.status,
      missClass: s.dose.missClass,
      critical: doseView().critical,
      alertedMe: s.dose.alerted.includes(s.me.mid),
      alertedCount: s.dose.alerted.length,
      claimedByName: s.dose.claimedBy ? nameOf(s.dose.claimedBy) : null,
    },
  ];
}

async function dashboard(): Promise<Dashboard> {
  const s = db();
  const { demoInsights } = await import("./demo-insights");
  const week = demoInsights(7);
  const today = istDate(now());
  return {
    family: { fid: s.me.fid, name: `${s.parent.displayName}'s family` },
    me: { mid: s.me.mid, role: s.me.role },
    members: s.members,
    parents: [
      {
        ...s.parent,
        myLadderPosition: s.parent.ladder.findIndex((m) => m.mid === s.me.mid) + 1 || null,
        slots: slotsInUse().map((slot) => ({ slotName: slot, compactTime: s.parent.slotTimes[slot].replace(":", ""), critical: s.medicines.some((m) => m.active && m.critical && (m.slots[slot] ?? 0) > 0), medicineCount: s.medicines.filter((m) => m.active && (m.slots[slot] ?? 0) > 0).length })),
        today: [{ doseId: s.dose.doseId, slotName: s.dose.slotName, scheduledAt: s.dose.scheduledAt, status: s.dose.status, missClass: s.dose.missClass, critical: doseView().critical, claimedByName: s.dose.claimedBy ? nameOf(s.dose.claimedBy) : null }],
        week: [...week.calendar.days.map((d) => ({ date: d.date, outcomes: Object.values(d.cells) })), { date: today, outcomes: [] }].slice(-7),
        refills: s.medicines
          .filter((m) => m.active && !m.asNeeded && m.pillsLeft !== null)
          .map((m) => {
            const perDay = Object.values(m.slots).reduce<number>((a, b) => a + (b ?? 0), 0);
            const daysLeft = perDay ? Math.floor((m.pillsLeft ?? 0) / perDay) : null;
            return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, daysLeft, level: daysLeft === null ? "ok" : daysLeft <= 2 ? "critical" : daysLeft <= m.refillThresholdDays ? "low" : "ok" } as const;
          }),
      },
    ],
    openAlerts: openAlerts(),
  };
}

function timeline(): Timeline {
  const s = db();
  const items = [...s.timeline].sort((a, b) => a.at.localeCompare(b.at));
  return {
    doseId: s.dose.doseId,
    parentName: s.parent.displayName,
    slotName: s.dose.slotName,
    scheduledAt: s.dose.scheduledAt,
    status: s.dose.status,
    missClass: s.dose.missClass,
    critical: doseView().critical,
    items: items.map((item, i) => ({ ...item, sincePreviousSeconds: i === 0 ? null : Math.round((Date.parse(item.at) - Date.parse(items[i - 1]!.at)) / 1000) })),
  };
}

function report(): Report {
  const s = db();
  const to = istDate(now());
  const from = istDate(now() - 6 * 86_400_000);
  return {
    parent: { displayName: s.parent.displayName },
    from,
    to,
    generatedAt: new Date().toISOString(),
    medicines: s.medicines.map(({ medId, nameAsPrinted, strength, slots, food, active }) => ({ medId, nameAsPrinted, strength, slots, food, active })),
    report: {
      rows: [
        { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, onTime: 11, late: 1, missed: 1, unknown: 1, adherence: 12 / 13 },
        { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", onTime: 6, late: 0, missed: 0, unknown: 1, adherence: 1 },
        { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", onTime: 5, late: 1, missed: 1, unknown: 0, adherence: 6 / 7 },
      ],
      misses: [
        { doseStamp: `${istDate(now() - 5 * 86_400_000).replaceAll("-", "")}0800`, outcome: "unknown", medicineNames: ["Glycomet GP 1", "Telma 40"], handledBy: "Meera" },
        { doseStamp: `${istDate(now() - 3 * 86_400_000).replaceAll("-", "")}2100`, outcome: "missed", medicineNames: ["Glycomet GP 1", "Lantus"], handledBy: "Arjun" },
      ],
      grid: Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => {
          const day = istDate(now() - (6 - i) * 86_400_000).replaceAll("-", "");
          return [day, { "0800": i === 1 ? "unknown" : "on_time", "2100": i === 3 ? "missed" : i === 5 ? "late" : "on_time" }];
        }),
      ) as Report["report"]["grid"],
    },
  };
}

function toMedicine(input: MedicineInput, medId = id("med")): MedicineView {
  return { medId, nameAsPrinted: input.nameAsPrinted, strength: input.strength, slots: input.slots, food: input.food, critical: input.critical, asNeeded: input.asNeeded, pillsLeft: input.pillsLeft, refillThresholdDays: input.refillThresholdDays, needsRecount: false, endDate: input.endDate, active: true };
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

type Body = Record<string, unknown> | undefined;

export async function mockApi(pathWithQuery: string, method: string, body: Body): Promise<unknown> {
  try {
    return await handle(pathWithQuery, method, body);
  } finally {
    if (method !== "GET") persist();
  }
}

async function handle(pathWithQuery: string, method: string, body: Body): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 180));
  const s = db();
  const [path, query = ""] = pathWithQuery.split("?");
  const params = new URLSearchParams(query);
  const route = `${method} ${path}`;
  const familyRoute = /^(GET|PUT|POST|PATCH|DELETE) \/(me|families|invites|doses|push\/subscriptions|parents)/.test(route);
  if (familyRoute && !s.signedIn) throw new ApiError(401, { message: "Not signed in" });

  // Family
  if (route === "GET /me") return { member: s.hasFamily ? s.me : null } satisfies Me;
  if (route === "PUT /me/lang") {
    s.me.lang = body!.lang as LanguageCode;
    s.members = s.members.map((m) => (m.mid === s.me.mid ? { ...m, lang: s.me.lang } : m));
    return { lang: s.me.lang };
  }
  if (route === "POST /families") {
    const me = body!.me as { displayName: string; relation?: string; lang: LanguageCode };
    const parent = body!.parent as { displayName: string; lang: LanguageCode };
    s.hasFamily = true;
    s.me = { ...s.me, displayName: me.displayName, relation: me.relation ?? null, lang: me.lang };
    s.members = [{ mid: s.me.mid, displayName: me.displayName, relation: me.relation ?? null, role: "owner", lang: me.lang }, ...s.members.filter((m) => m.mid !== s.me.mid)];
    s.parent = { ...s.parent, displayName: parent.displayName, lang: parent.lang };
    return { fid: s.me.fid, mid: s.me.mid, pid: s.parent.pid };
  }
  if (route === "POST /invites/accept") {
    s.hasFamily = true;
    return { fid: s.me.fid, mid: s.me.mid };
  }
  if (/^GET \/families\/[^/]+$/.test(route)) return dashboard();
  if (/^POST \/families\/[^/]+\/invites$/.test(route)) {
    const code = inviteCode();
    const path = body!.kind === "parent" ? "/join" : "/invite";
    return { code, link: `${window.location.origin}${path}#c=${code}`, expiresAt: new Date(now() + 48 * 60 * MIN).toISOString() };
  }
  if (/^PUT \/families\/[^/]+\/parents\/[^/]+\/ladder$/.test(route)) {
    const ids = body!.memberIds as string[];
    s.parent.ladder = ids.map((mid) => ({ mid, displayName: nameOf(mid) }));
    return { pid: s.parent.pid, ladder: ids };
  }
  if (/^PATCH \/families\/[^/]+\/parents\/[^/]+$/.test(route)) {
    if (body!.slotTimes) s.parent.slotTimes = { ...s.parent.slotTimes, ...(body!.slotTimes as Record<SlotName, string>) };
    if (typeof body!.paused === "boolean") s.parent.paused = body!.paused;
    if (typeof body!.displayName === "string") s.parent.displayName = body!.displayName;
    return { pid: s.parent.pid, updated: Object.keys(body!) };
  }
  if (/^POST \/families\/[^/]+\/parents\/[^/]+\/test-dose$/.test(route)) {
    if (s.testDosesToday >= 3) throw new ApiError(429, { message: "You can send three test reminders a day." });
    s.testDosesToday++;
    return { executionArn: "mock", slotName: "morning" };
  }
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/devices$/.test(route)) return { devices: s.devices, lastReceiptAt: s.parent.lastReceiptAt };
  if (/^DELETE \/families\/[^/]+\/parents\/[^/]+\/devices\/[^/]+$/.test(route)) {
    const deviceId = path!.split("/").pop()!;
    s.devices = s.devices.filter((d) => d.deviceId !== deviceId);
    return { deviceId, revoked: true };
  }
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/medicines$/.test(route)) return { medicines: s.medicines.filter((m) => m.active) };
  if (/^POST \/families\/[^/]+\/parents\/[^/]+\/medicines$/.test(route)) {
    const medicine = toMedicine(body as unknown as MedicineInput);
    s.medicines.push(medicine);
    return { medicine };
  }
  if (/^DELETE \/families\/[^/]+\/parents\/[^/]+\/medicines\/[^/]+$/.test(route)) {
    const medId = path!.split("/").pop()!;
    s.medicines = s.medicines.map((m) => (m.medId === medId ? { ...m, active: false } : m));
    return { medId, active: false };
  }
  if (/^POST \/families\/[^/]+\/parents\/[^/]+\/medicines\/[^/]+\/refill$/.test(route)) {
    const medId = path!.split("/").slice(-2)[0]!;
    const added = Number(body!.added);
    s.medicines = s.medicines.map((m) => (m.medId === medId ? { ...m, pillsLeft: (m.pillsLeft ?? 0) + added, needsRecount: false } : m));
    return { medicine: s.medicines.find((m) => m.medId === medId) };
  }
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/report$/.test(route)) return report();
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/insights$/.test(route)) {
    const { demoInsights } = await import("./demo-insights");
    return demoInsights(params.get("days") === "7" ? 7 : 30);
  }
  if (/^POST \/families\/[^/]+\/prescriptions$/.test(route)) {
    const rxId = id("rx");
    s.prescriptions[rxId] = { pid: String(body!.pid), confirmed: false };
    const upload = { url: "mock://upload", fields: {} };
    return { rxId, uploads: { model: upload, original: upload }, uploadOrder: ["model", "original"], expiresInSeconds: 300 };
  }
  if (/^GET \/families\/[^/]+\/prescriptions\/[^/]+$/.test(route)) {
    const rxId = path!.split("/").pop()!;
    const { samplePrescription } = await import("../../../backend/src/demo/sample-prescription");
    const sample = samplePrescription();
    return { rxId, pid: s.parent.pid, status: s.prescriptions[rxId]?.confirmed ? "CONFIRMED" : "READY", guardrailInterventions: 1, imageUrl: sample.imagePath, lines: sample.lines, rows: sample.rows } satisfies Prescription;
  }
  if (/^POST \/families\/[^/]+\/prescriptions\/[^/]+\/confirm$/.test(route)) {
    const rxId = path!.split("/").slice(-2)[0]!;
    const decisions = body!.decisions as { action: string; medicine?: MedicineInput }[];
    const added = decisions.filter((d) => d.action === "confirm" && d.medicine).map((d) => toMedicine(d.medicine!));
    s.medicines.push(...added);
    if (s.prescriptions[rxId]) s.prescriptions[rxId].confirmed = true;
    return { rxId, medIds: added.map((m) => m.medId) };
  }
  if (/^POST \/doses\/[^/]+\/claim$/.test(route)) {
    if (s.dose.status !== "ESCALATING") throw new ApiError(409, { message: "Already being handled", claimedByName: s.dose.claimedBy ? nameOf(s.dose.claimedBy) : null });
    s.dose.status = "CLAIMED";
    s.dose.claimedBy = s.me.mid;
    s.timeline.push({ at: new Date().toISOString(), kind: "claimed", people: [s.me.displayName], authorizedBy: ["only-alerted-members-can-claim"] });
    s.timeline.push({ at: new Date(now() + 1000).toISOString(), kind: "others_stood_down", stateName: "TellOthersToStandDown" });
    return { status: "CLAIMED", claimedBy: s.me.mid, claimedAt: new Date().toISOString() };
  }
  if (/^GET \/doses\/[^/]+\/timeline$/.test(route)) return timeline();
  if (route === "POST /push/subscriptions") return { saved: true };

  // Parent phone
  if (route === "POST /parent/pair") {
    if (String(body!.code).replace(/[^A-Za-z0-9]/g, "").length < 8) throw new ApiError(404, { message: "This code is not valid any more." });
    return { deviceToken: "dt_mock", parent: { displayName: s.parent.displayName, lang: s.parent.lang } };
  }
  if (route === "GET /parent/today") {
    const view = doseView();
    return {
      parent: { displayName: s.parent.displayName, lang: s.parent.lang, paused: s.parent.paused },
      slots: slotsInUse().map((slot) => ({
        slotName: slot,
        time: s.parent.slotTimes[slot],
        medicines: s.medicines.filter((m) => m.active && (m.slots[slot] ?? 0) > 0).map((m) => medicineLine(m, slot)),
        dose: slot === view.slotName ? { doseId: view.doseId, status: view.status } : null,
      })),
    } satisfies ParentToday;
  }
  if (/^GET \/parent\/doses\/[^/]+$/.test(route)) return doseView();
  if (/^POST \/parent\/doses\/[^/]+\/taken$/.test(route)) {
    const late = s.dose.status === "ESCALATING" || s.dose.status === "CLAIMED";
    if (s.dose.status === "PENDING" || late) {
      s.dose.status = late ? "TAKEN_LATE" : "TAKEN";
      s.timeline.push({ at: new Date().toISOString(), kind: "taken", people: [s.parent.displayName], authorizedBy: ["parent-phone-confirms-own-doses"] });
      if (late) s.timeline.push({ at: new Date(now() + 1000).toISOString(), kind: "family_told_taken", stateName: "TellFamilyParentTookIt" });
      s.medicines = s.medicines.map((m) => ((m.slots[s.dose.slotName] ?? 0) > 0 && m.pillsLeft !== null ? { ...m, pillsLeft: Math.max(0, m.pillsLeft - (m.slots[s.dose.slotName] ?? 0)) } : m));
    }
    return { status: s.dose.status };
  }
  if (route === "PUT /parent/lang") {
    s.parent.lang = body!.lang as LanguageCode;
    return { lang: s.parent.lang };
  }
  if (route === "POST /parent/push/subscription") return { saved: true };

  throw new ApiError(404, { message: `The local preview does not support ${route} yet.` });
}
