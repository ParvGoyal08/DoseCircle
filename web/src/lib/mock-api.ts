import { CHECK_DEFINITIONS, checkDefinition, formatReading, isCheckDueAt, roundReading, SLOT_NAMES, validateReading, type LanguageCode, type SlotName } from "@dosecircle/shared";
import { ApiError } from "./api";
import type {
  CheckCatalogue,
  CheckInput,
  CheckLine,
  CheckView,
  Dashboard,
  DoseView,
  FamilyMember,
  MedicineInput,
  MedicineLine,
  MedicineView,
  Me,
  OpenAlert,
  ParentCard,
  ParentToday,
  Prescription,
  RecordedReading,
  Report,
  Timeline,
  TimelineItem,
} from "./types";

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
  parents: Omit<ParentCard, "today" | "week" | "refills" | "slots" | "myLadderPosition">[];
  medicines: MedicineView[];
  checks: CheckView[];
  readings: { checkId: string; type: CheckView["type"]; values: Record<string, number>; at: string; doseId: string | null }[];
  dose: { doseId: string; slotName: SlotName; scheduledAt: string; status: DoseView["status"]; missClass: "MISSED" | "OFFLINE" | null; claimedBy: string | null; alerted: string[] };
  timeline: Omit<TimelineItem, "sincePreviousSeconds">[];
  devices: { deviceId: string; pairedAt: string | null; lang: LanguageCode }[];
  testDosesToday: number;
  prescriptions: Record<string, { pid: string; confirmed: boolean }>;
}

function toCheck(input: CheckInput, checkId = id("chk")): CheckView {
  const definition = checkDefinition(input.type);
  return {
    checkId,
    type: input.type,
    slots: input.slots,
    weekdays: input.weekdays,
    escalates: input.escalates ?? definition.escalatesByDefault,
    endDate: input.endDate,
    active: true,
    fields: definition.fields,
    chart: definition.chart,
  };
}

/** Thirty days of plausible morning readings, so the trend panels have something to draw. */
function mockReadings(): Store["readings"] {
  const readings: Store["readings"] = [];
  for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
    if (dayOffset % 9 === 4) continue; // some mornings genuinely have no reading
    const day = new Date(now() - dayOffset * 86_400_000);
    const at = new Date(Date.parse(`${istDate(day.getTime())}T08:12:00+05:30`)).toISOString();
    const wave = Math.sin(dayOffset / 3.1);
    readings.push({ checkId: "chk-sugar", type: "glucose", values: { glucose: Math.round(112 + dayOffset * 0.8 + wave * 9) }, at, doseId: null });
    readings.push({ checkId: "chk-bp", type: "bp", values: { systolic: Math.round(128 + wave * 8), diastolic: Math.round(81 + wave * 4), pulse: Math.round(74 + wave * 5) }, at, doseId: null });
    if (day.getUTCDay() === 0) readings.push({ checkId: "chk-weight", type: "weight", values: { weight: Math.round((61.5 + dayOffset * 0.04) * 10) / 10 }, at, doseId: null });
  }
  return readings;
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
    parents: [{
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
    }],
    medicines: [
      { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, slots: { morning: 1, night: 1 }, food: "after", critical: false, asNeeded: false, pillsLeft: 6, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
      { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", slots: { morning: 1 }, food: null, critical: false, asNeeded: false, pillsLeft: 24, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
      { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", slots: { night: 1 }, food: null, critical: true, asNeeded: false, pillsLeft: null, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
    ],
    checks: [
      toCheck({ type: "glucose", slots: ["morning"], weekdays: [], escalates: true, endDate: null }, "chk-sugar"),
      toCheck({ type: "bp", slots: ["morning"], weekdays: [], escalates: true, endDate: null }, "chk-bp"),
      toCheck({ type: "weight", slots: ["morning"], weekdays: [0], escalates: false, endDate: null }, "chk-weight"),
    ],
    readings: mockReadings(),
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

/** The dependent every existing screen acts on; the first is the default, as on the dashboard. */
const theParent = () => db().parents[0]!;
const nameOf = (mid: string) => db().members.find((m) => m.mid === mid)?.displayName ?? "";

function medicineLine(m: MedicineView, slot: SlotName): MedicineLine {
  return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, strength: m.strength, count: m.slots[slot] ?? null, food: m.food, critical: m.critical };
}

function slotsInUse(): SlotName[] {
  return SLOT_NAMES.filter(
    (slot) =>
      db().medicines.some((m) => m.active && !m.asNeeded && (m.slots[slot] ?? 0) > 0) || db().checks.some((c) => c.active && c.slots.includes(slot)),
  );
}

const checkLine = (check: CheckView): CheckLine => ({ checkId: check.checkId, type: check.type, fields: check.fields });

/** Checks actually asked for at this time of day, today. */
function checksDueAt(slot: SlotName): CheckView[] {
  const today = istDate(now());
  const weekday = new Date(`${today}T12:00:00+05:30`).getDay();
  return db().checks.filter((c) => isCheckDueAt({ ...c, endDate: c.endDate ?? undefined }, slot, today, weekday));
}

function recordedToday(checkId: string): RecordedReading | null {
  const today = istDate(now());
  const match = db()
    .readings.filter((r) => r.checkId === checkId && istDate(Date.parse(r.at)) === today)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return match ? { at: match.at, values: match.values, text: formatReading(match.type, match.values) } : null;
}

/** Same shape as backend/src/views/readings.ts, built from the mock store. */
function readingSeries(days: number) {
  const from = istDate(now() - (days - 1) * 86_400_000);
  const to = istDate(now());
  const middle = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  };
  return db()
    .checks.filter((c) => c.active)
    .map((check) => {
      const points = db()
        .readings.filter((r) => r.checkId === check.checkId && istDate(Date.parse(r.at)) >= from && istDate(Date.parse(r.at)) <= to)
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((r) => ({ date: istDate(Date.parse(r.at)), at: r.at, values: r.values, text: formatReading(r.type, r.values) }));
      const dates = Array.from({ length: days }, (_, i) => istDate(now() - (days - 1 - i) * 86_400_000));
      const askedDays = dates.filter((date) =>
        check.slots.some((slot) => isCheckDueAt({ ...check, endDate: check.endDate ?? undefined }, slot, date, new Date(`${date}T12:00:00+05:30`).getDay())),
      ).length;
      const spread = check.fields
        .map((field) => {
          const numbers = points.map((p) => p.values[field.key]).filter((v): v is number => typeof v === "number");
          return numbers.length === 0 ? null : { key: field.key, unit: field.unit, lowest: Math.min(...numbers), highest: Math.max(...numbers), middle: middle(numbers) };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
      return {
        checkId: check.checkId,
        type: check.type,
        fields: check.fields,
        chart: check.chart,
        escalates: check.escalates,
        askedDays,
        recordedDays: new Set(points.map((p) => p.date)).size,
        points,
        latest: points[points.length - 1] ?? null,
        spread,
      };
    });
}

function doseView(): DoseView {
  const s = db();
  return {
    doseId: s.dose.doseId,
    status: s.dose.status,
    slotName: s.dose.slotName,
    scheduledAt: s.dose.scheduledAt,
    critical: s.medicines.some((m) => m.active && m.critical && (m.slots[s.dose.slotName] ?? 0) > 0),
    parent: { displayName: theParent().displayName, lang: theParent().lang },
    medicines: s.medicines.filter((m) => m.active && (m.slots[s.dose.slotName] ?? 0) > 0).map((m) => medicineLine(m, s.dose.slotName)),
    checks: checksDueAt(s.dose.slotName).map(checkLine),
    voice: { src: `/audio/${theParent().lang}/remind_${s.dose.slotName}.mp3`, thanks: `/audio/${theParent().lang}/taken_thanks.mp3` },
  };
}

function openAlerts(): OpenAlert[] {
  const s = db();
  if (s.dose.status !== "ESCALATING" && s.dose.status !== "CLAIMED") return [];
  return [
    {
      doseId: s.dose.doseId,
      pid: theParent().pid,
      parentName: theParent().displayName,
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
    family: { fid: s.me.fid, name: `${theParent().displayName}'s family` },
    me: { mid: s.me.mid, role: s.me.role },
    members: s.members,
    // Only the first dependent carries the seeded history; anyone added later starts empty, which is
    // exactly what a newly added person looks like.
    parents: s.parents.map((p, index) => ({
      ...p,
      myLadderPosition: p.ladder.findIndex((m) => m.mid === s.me.mid) + 1 || null,
      slots:
        index > 0
          ? []
          : slotsInUse().map((slot) => ({
              slotName: slot,
              compactTime: p.slotTimes[slot].replace(":", ""),
              critical: s.medicines.some((m) => m.active && m.critical && (m.slots[slot] ?? 0) > 0),
              medicineCount: s.medicines.filter((m) => m.active && (m.slots[slot] ?? 0) > 0).length,
            })),
      today:
        index > 0
          ? []
          : [{ doseId: s.dose.doseId, slotName: s.dose.slotName, scheduledAt: s.dose.scheduledAt, status: s.dose.status, missClass: s.dose.missClass, critical: doseView().critical, claimedByName: s.dose.claimedBy ? nameOf(s.dose.claimedBy) : null }],
      week: index > 0 ? [] : [...week.calendar.days.map((d) => ({ date: d.date, outcomes: Object.values(d.cells) })), { date: today, outcomes: [] }].slice(-7),
      refills:
        index > 0
          ? []
          : s.medicines
              .filter((m) => m.active && !m.asNeeded && m.pillsLeft !== null)
              .map((m) => {
                const perDay = Object.values(m.slots).reduce<number>((a, b) => a + (b ?? 0), 0);
                const daysLeft = perDay ? Math.floor((m.pillsLeft ?? 0) / perDay) : null;
                return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, daysLeft, level: daysLeft === null ? "ok" : daysLeft <= 2 ? "critical" : daysLeft <= m.refillThresholdDays ? "low" : "ok" } as const;
              }),
    })),
    openAlerts: openAlerts(),
  };
}

function timeline(): Timeline {
  const s = db();
  const items = [...s.timeline].sort((a, b) => a.at.localeCompare(b.at));
  return {
    doseId: s.dose.doseId,
    parentName: theParent().displayName,
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
    parent: { displayName: theParent().displayName },
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
    readings: readingSeries(7),
  };
}

/** Validates and stores one reading, exactly as the real API does. */
function saveReading(input: Record<string, unknown>): RecordedReading & { checkId: string; type: CheckView["type"] } {
  const s = db();
  const checkId = String(input.checkId);
  const check = s.checks.find((c) => c.checkId === checkId);
  if (!check) throw new ApiError(404, { message: "Check not found" });
  const values = input.values as Record<string, number>;
  const problems = validateReading(check.type, values);
  if (problems.length > 0) {
    const first = problems[0]!;
    const field = check.fields.find((f) => f.key === first.field);
    const message =
      first.reason === "missing"
        ? `${first.field} is needed`
        : first.reason === "unknown_field"
          ? `${first.field} is not part of this check`
          : `${first.field} must be between ${field?.min} and ${field?.max} ${field?.unit}`;
    throw new ApiError(400, { message });
  }
  const rounded = roundReading(check.type, values) as Record<string, number>;
  const at = typeof input.at === "string" ? input.at : new Date().toISOString();
  s.readings = [...s.readings.filter((r) => !(r.checkId === checkId && istDate(Date.parse(r.at)) === istDate(Date.parse(at)))), { checkId, type: check.type, values: rounded, at, doseId: (input.doseId as string) ?? null }];
  return { checkId, type: check.type, values: rounded, at, text: formatReading(check.type, rounded) };
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
    s.parents[0] = { ...theParent(), displayName: parent.displayName, lang: parent.lang };
    return { fid: s.me.fid, mid: s.me.mid, pid: theParent().pid };
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
    theParent().ladder = ids.map((mid) => ({ mid, displayName: nameOf(mid) }));
    return { pid: theParent().pid, ladder: ids };
  }
  if (/^PATCH \/families\/[^/]+\/parents\/[^/]+$/.test(route)) {
    if (body!.slotTimes) theParent().slotTimes = { ...theParent().slotTimes, ...(body!.slotTimes as Record<SlotName, string>) };
    if (typeof body!.paused === "boolean") theParent().paused = body!.paused;
    if (typeof body!.displayName === "string") theParent().displayName = body!.displayName;
    return { pid: theParent().pid, updated: Object.keys(body!) };
  }
  if (/^POST \/families\/[^/]+\/parents\/[^/]+\/test-dose$/.test(route)) {
    if (theParent().paused) throw new ApiError(409, { message: "Reminders are paused for this person", reason: "paused" });
    if (!s.medicines.some((m) => m.active && !m.asNeeded)) throw new ApiError(400, { message: "Add a medicine first", reason: "no_medicines" });
    if (s.devices.length === 0) throw new ApiError(409, { message: "Their phone is not connected yet", reason: "no_phone" });
    if (s.testDosesToday >= 3) throw new ApiError(429, { message: "You can send three test reminders a day.", reason: "limit" });
    s.testDosesToday++;
    return { executionArn: "mock", slotName: "morning" };
  }
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/devices$/.test(route)) return { devices: s.devices, lastReceiptAt: theParent().lastReceiptAt };
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
    const days = params.get("days") === "7" ? 7 : 30;
    return { ...demoInsights(days), readings: readingSeries(days) };
  }

  // Daily checks and readings
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/checks$/.test(route)) {
    return { checks: s.checks.filter((c) => c.active), types: Object.values(CHECK_DEFINITIONS) } satisfies CheckCatalogue;
  }
  if (/^POST \/families\/[^/]+\/parents\/[^/]+\/checks$/.test(route)) {
    const input = body as unknown as CheckInput;
    if (s.checks.some((c) => c.active && c.type === input.type)) throw new ApiError(409, { message: "That check is already scheduled. Change the existing one instead." });
    const check = toCheck(input);
    s.checks.push(check);
    return { check };
  }
  if (/^PATCH \/families\/[^/]+\/parents\/[^/]+\/checks\/[^/]+$/.test(route)) {
    const checkId = path!.split("/").pop()!;
    const current = s.checks.find((c) => c.checkId === checkId && c.active);
    if (!current) throw new ApiError(404, { message: "Check not found" });
    Object.assign(current, body);
    return { check: current };
  }
  if (/^DELETE \/families\/[^/]+\/parents\/[^/]+\/checks\/[^/]+$/.test(route)) {
    const checkId = path!.split("/").pop()!;
    s.checks = s.checks.map((c) => (c.checkId === checkId ? { ...c, active: false } : c));
    return { checkId, active: false };
  }
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/readings$/.test(route)) {
    const days = Number(params.get("days") ?? 30);
    return {
      from: new Date(now() - days * 86_400_000).toISOString(),
      to: new Date().toISOString(),
      checks: s.checks,
      readings: s.readings.map((r) => ({ ...r, text: formatReading(r.type, r.values) })),
    };
  }
  if (/^POST \/families\/[^/]+\/parents\/[^/]+\/readings$/.test(route)) return { reading: saveReading(body!) };
  if (/^DELETE \/families\/[^/]+\/parents\/[^/]+\/readings\/[^/]+\/[^/]+$/.test(route)) {
    const [at, checkId] = path!.split("/").slice(-2) as [string, string];
    s.readings = s.readings.filter((r) => !(r.checkId === checkId && r.at === decodeURIComponent(at)));
    return { deleted: true };
  }

  // Who is in the family
  if (/^GET \/families\/[^/]+\/members$/.test(route)) {
    return {
      members: s.members.map((m) => ({
        ...m,
        joined: true,
        ladderPositions: theParent().ladder.some((l) => l.mid === m.mid) ? [{ pid: theParent().pid, position: theParent().ladder.findIndex((l) => l.mid === m.mid) + 1 }] : [],
      })) satisfies FamilyMember[],
    };
  }
  if (/^PATCH \/families\/[^/]+\/members\/[^/]+$/.test(route)) {
    const mid = path!.split("/").pop()!;
    const member = s.members.find((m) => m.mid === mid);
    if (!member) throw new ApiError(404, { message: "That person is not in this family" });
    if (body!.role === "member" && member.role === "owner" && s.members.filter((m) => m.role === "owner").length === 1) {
      throw new ApiError(409, { message: "A family needs at least one owner" });
    }
    Object.assign(member, body);
    if (mid === s.me.mid) s.me = { ...s.me, ...(body as Partial<typeof s.me>) };
    return { member: { ...member, joined: true } };
  }
  if (/^DELETE \/families\/[^/]+\/members\/[^/]+$/.test(route)) {
    const mid = path!.split("/").pop()!;
    if (mid === s.me.mid) throw new ApiError(400, { message: "Use leave instead of removing yourself" });
    if (!s.members.some((m) => m.mid === mid)) throw new ApiError(404, { message: "That person is not in this family" });
    if (theParent().ladder.length === 1 && theParent().ladder[0]!.mid === mid) {
      throw new ApiError(409, { message: "Add someone else to the alert order first, so there is still somebody to tell" });
    }
    s.members = s.members.filter((m) => m.mid !== mid);
    theParent().ladder = theParent().ladder.filter((l) => l.mid !== mid);
    s.dose.alerted = s.dose.alerted.filter((a) => a !== mid);
    return { mid, removed: true };
  }
  if (/^POST \/families\/[^/]+\/parents$/.test(route)) {
    const parent = {
      pid: id("p"),
      displayName: String(body!.displayName),
      lang: body!.lang as LanguageCode,
      paused: false,
      slotTimes: { morning: "08:00", afternoon: "13:00", evening: "18:00", night: "21:00" },
      lastReceiptAt: null,
      // A new dependent inherits the existing alert order, as on the server.
      ladder: [...theParent().ladder],
    };
    s.parents.push(parent);
    return { pid: parent.pid, displayName: parent.displayName, lang: parent.lang };
  }
  if (/^POST \/families\/[^/]+\/leave$/.test(route)) {
    if (s.members.length === 1) throw new ApiError(409, { message: "The last person in a family cannot leave. Delete the family instead." });
    if (s.me.role === "owner" && s.members.filter((m) => m.role === "owner").length === 1) throw new ApiError(409, { message: "Make someone else an owner first" });
    s.members = s.members.filter((m) => m.mid !== s.me.mid);
    theParent().ladder = theParent().ladder.filter((l) => l.mid !== s.me.mid);
    s.hasFamily = false;
    return { left: true };
  }
  if (/^DELETE \/families\/[^/]+$/.test(route)) {
    if (String(body?.confirmName ?? "").trim() !== `${theParent().displayName}'s family`) throw new ApiError(400, { message: "The name does not match" });
    store = initialStore();
    store.hasFamily = false;
    return { deleted: true, items: 0, schedules: 0 };
  }
  if (/^POST \/families\/[^/]+\/prescriptions$/.test(route)) {
    const rxId = id("rx");
    s.prescriptions[rxId] = { pid: String(body!.pid), confirmed: false };
    const upload = { url: "mock://upload", fields: {} };
    return { rxId, uploads: { model: upload, original: upload }, uploadOrder: ["model", "original"], expiresInSeconds: 300 };
  }
  if (/^GET \/families\/[^/]+\/parents\/[^/]+\/prescriptions$/.test(route)) {
    const pid = path!.split("/")[4]!;
    return { prescriptions: Object.entries(s.prescriptions).filter(([, rx]) => rx.pid === pid && !rx.confirmed).map(([rxId]) => ({ rxId, status: "READY", createdAt: new Date().toISOString() })) };
  }
  if (/^GET \/families\/[^/]+\/prescriptions\/[^/]+$/.test(route)) {
    const rxId = path!.split("/").pop()!;
    const { samplePrescription } = await import("../../../backend/src/demo/sample-prescription");
    const sample = samplePrescription();
    return { rxId, pid: theParent().pid, status: s.prescriptions[rxId]?.confirmed ? "CONFIRMED" : "READY", guardrailInterventions: 1, imageUrl: sample.imagePath, lines: sample.lines, rows: sample.rows } satisfies Prescription;
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
    return { deviceToken: "dt_mock", parent: { displayName: theParent().displayName, lang: theParent().lang } };
  }
  if (route === "GET /parent/today") {
    const view = doseView();
    return {
      parent: { displayName: theParent().displayName, lang: theParent().lang, paused: theParent().paused },
      hasSchedule: s.medicines.some((m) => m.active) || s.checks.some((c) => c.active),
      slots: slotsInUse().map((slot) => ({
        slotName: slot,
        time: theParent().slotTimes[slot],
        medicines: s.medicines.filter((m) => m.active && (m.slots[slot] ?? 0) > 0).map((m) => medicineLine(m, slot)),
        checks: checksDueAt(slot).map((c) => ({ ...checkLine(c), recorded: recordedToday(c.checkId) })),
        dose: slot === view.slotName ? { doseId: view.doseId, status: view.status } : null,
      })),
    } satisfies ParentToday;
  }
  if (/^GET \/parent\/doses\/[^/]+$/.test(route)) return doseView();
  if (route === "POST /parent/readings") return { reading: saveReading(body!) };
  if (/^POST \/parent\/doses\/[^/]+\/taken$/.test(route)) {
    // Readings typed on the reminder screen are stored before the status flips, as on the server.
    for (const reading of (body?.readings as Record<string, unknown>[] | undefined) ?? []) saveReading({ ...reading, doseId: s.dose.doseId });
    const late = s.dose.status === "ESCALATING" || s.dose.status === "CLAIMED";
    if (s.dose.status === "PENDING" || late) {
      s.dose.status = late ? "TAKEN_LATE" : "TAKEN";
      s.timeline.push({ at: new Date().toISOString(), kind: "taken", people: [theParent().displayName], authorizedBy: ["parent-phone-confirms-own-doses"] });
      if (late) s.timeline.push({ at: new Date(now() + 1000).toISOString(), kind: "family_told_taken", stateName: "TellFamilyParentTookIt" });
      s.medicines = s.medicines.map((m) => ((m.slots[s.dose.slotName] ?? 0) > 0 && m.pillsLeft !== null ? { ...m, pillsLeft: Math.max(0, m.pillsLeft - (m.slots[s.dose.slotName] ?? 0)) } : m));
    }
    return { status: s.dose.status };
  }
  if (route === "PUT /parent/name") {
    s.parents[0] = { ...theParent(), displayName: String(body!.displayName) };
    return { displayName: theParent().displayName };
  }
  if (route === "POST /parent/prescriptions") {
    const rxId = id("rx");
    s.prescriptions[rxId] = { pid: theParent().pid, confirmed: false };
    const upload = { url: "mock://upload", fields: {} };
    return { rxId, uploads: { model: upload, original: upload }, uploadOrder: ["model", "original"], expiresInSeconds: 300 };
  }
  if (route === "PUT /parent/lang") {
    theParent().lang = body!.lang as LanguageCode;
    return { lang: theParent().lang };
  }
  if (route === "POST /parent/push/subscription") return { saved: true };

  throw new ApiError(404, { message: `The local preview does not support ${route} yet.` });
}
