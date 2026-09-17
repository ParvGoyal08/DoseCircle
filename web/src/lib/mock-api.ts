import type { ReportOutcome } from "@dosecircle/shared";
import type { Dashboard, DoseView, MedicineView, Me, ParentToday, Prescription, Report, Timeline } from "./types";

/**
 * Development only: canned responses so family and parent screens can be built and screenshotted
 * without AWS. Loaded through a dynamic import guarded by import.meta.env.DEV, so it never ships.
 */

const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const day = (daysAgo: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(now - daysAgo * 86_400_000));

const week: { date: string; outcomes: ReportOutcome[] }[] = [
  { date: day(6), outcomes: ["on_time", "on_time"] },
  { date: day(5), outcomes: ["missed", "on_time"] },
  { date: day(4), outcomes: ["on_time", "unknown"] },
  { date: day(3), outcomes: ["on_time", "on_time"] },
  { date: day(2), outcomes: ["late", "on_time"] },
  { date: day(1), outcomes: ["on_time", "on_time"] },
  { date: day(0), outcomes: ["open"] },
];

const doseId = "p-demo_202609180800";

const dose: DoseView = {
  doseId,
  status: "PENDING",
  slotName: "morning",
  scheduledAt: iso(4),
  critical: false,
  parent: { displayName: "Shantha", lang: "kn" },
  medicines: [
    { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, count: 1, food: "after", critical: false },
    { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", count: 0.5, food: null, critical: false },
  ],
  voice: { src: "/audio/kn/remind_morning.mp3", thanks: "/audio/kn/taken_thanks.mp3" },
};

const dashboard: Dashboard = {
  family: { fid: "fam-mock", name: "Shantha's family" },
  me: { mid: "m-son", role: "owner" },
  members: [
    { mid: "m-son", displayName: "Arjun", relation: "Son", role: "owner", lang: "en" },
    { mid: "m-daughter", displayName: "Meera", relation: "Daughter", role: "member", lang: "hi" },
  ],
  parents: [
    {
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
      myLadderPosition: 1,
      slots: [
        { slotName: "morning", compactTime: "0800", critical: false, medicineCount: 2 },
        { slotName: "night", compactTime: "2100", critical: true, medicineCount: 2 },
      ],
      today: [{ doseId, slotName: "morning", scheduledAt: iso(34), status: "ESCALATING", missClass: "MISSED", critical: false, claimedByName: null }],
      week,
      refills: [
        { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", daysLeft: 3, level: "low" },
        { medId: "med-telma", nameAsPrinted: "Telma 40", daysLeft: 24, level: "ok" },
      ],
    },
  ],
  openAlerts: [{ doseId, pid: "p-demo", parentName: "Shantha", slotName: "morning", scheduledAt: iso(34), status: "ESCALATING", missClass: "MISSED", critical: false, alertedMe: true, alertedCount: 1, claimedByName: null }],
};

const timeline: Timeline = {
  doseId,
  parentName: "Shantha",
  slotName: "morning",
  scheduledAt: iso(34),
  status: "ESCALATING",
  missClass: "MISSED",
  critical: false,
  items: [
    { at: iso(34), kind: "reminder_sent", stateName: "RemindParent", sincePreviousSeconds: null },
    { at: iso(34), kind: "reached_phone", people: ["Shantha"], sincePreviousSeconds: 2 },
    { at: iso(14), kind: "no_confirmation", stateName: "RemindParent", sincePreviousSeconds: 1198 },
    { at: iso(14), kind: "nudge_sent", stateName: "NudgeParent", sincePreviousSeconds: 1 },
    { at: iso(4), kind: "no_confirmation", stateName: "NudgeParent", sincePreviousSeconds: 600 },
    { at: iso(4), kind: "reminder_reached_phone", stateName: "WasReminderDelivered", sincePreviousSeconds: 0 },
    { at: iso(4), kind: "member_alerted", stateName: "AlertFamilyMember", people: ["Arjun"], sincePreviousSeconds: 1 },
  ],
};

const medicines: MedicineView[] = [
  { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, slots: { morning: 1, night: 1 }, food: "after", critical: false, asNeeded: false, pillsLeft: 6, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
  { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", slots: { morning: 1 }, food: null, critical: false, asNeeded: false, pillsLeft: 24, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
  { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", slots: { night: 1 }, food: null, critical: true, asNeeded: false, pillsLeft: null, refillThresholdDays: 5, needsRecount: false, endDate: null, active: true },
];

const stamp = (daysAgo: number, hhmm: string) => `${day(daysAgo).replaceAll("-", "")}${hhmm}`;
const report: Report = {
  parent: { displayName: "Shantha" },
  from: day(6),
  to: day(0),
  generatedAt: new Date(now).toISOString(),
  medicines: medicines.map(({ medId, nameAsPrinted, strength, slots, food, active }) => ({ medId, nameAsPrinted, strength, slots, food, active })),
  report: {
    rows: [
      { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, onTime: 9, late: 1, missed: 1, unknown: 1, adherence: 10 / 11 },
      { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", onTime: 4, late: 1, missed: 1, unknown: 0, adherence: 5 / 6 },
      { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", onTime: 5, late: 0, missed: 0, unknown: 1, adherence: 1 },
    ],
    misses: [
      { doseStamp: stamp(5, "0800"), outcome: "missed", medicineNames: ["Glycomet GP 1", "Telma 40"], handledBy: null },
      { doseStamp: stamp(4, "2100"), outcome: "unknown", medicineNames: ["Glycomet GP 1", "Lantus"], handledBy: "Arjun" },
    ],
    grid: Object.fromEntries(
      week.slice(0, 6).map((w, i) => [w.date.replaceAll("-", ""), { "0800": w.outcomes[0]!, "2100": (w.outcomes[1] ?? "on_time") as ReportOutcome }]),
    ) as Record<string, Record<string, ReportOutcome>>,
  },
};

const today: ParentToday = {
  parent: { displayName: "Shantha", lang: "kn", paused: false },
  slots: [
    { slotName: "morning", time: "08:00", medicines: dose.medicines, dose: { doseId, status: "PENDING" } },
    { slotName: "night", time: "21:00", medicines: [dose.medicines[0]!, { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", count: 1, food: null, critical: true }], dose: null },
  ],
};

export async function mockApi(path: string, method: string): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 150));
  if (path === "/me") return { member: { fid: "fam-mock", mid: "m-son", displayName: "Arjun", relation: "Son", role: "owner", lang: "en" } } satisfies Me;
  if (/^\/families\/[^/]+$/.test(path)) return dashboard;
  if (/\/timeline$/.test(path)) return timeline;
  if (/\/medicines$/.test(path) && method === "GET") return { medicines };
  if (/\/report$/.test(path)) return report;
  if (/\/devices$/.test(path)) return { devices: [{ deviceId: "dev-1", pairedAt: iso(60 * 24 * 3), lang: "kn" }], lastReceiptAt: iso(26) };
  if (path === "/parent/today") return today;
  if (path.startsWith("/parent/doses/")) return dose;
  if (/\/prescriptions\/[^/]+$/.test(path)) {
    const { samplePrescription } = await import("../../../backend/src/demo/sample-prescription");
    return { rxId: "rx-mock", pid: "p-demo", status: "READY", guardrailInterventions: 1, ...samplePrescription() } satisfies Prescription;
  }
  if (method !== "GET") return {};
  throw new Error(`No mock for ${method} ${path}`);
}
