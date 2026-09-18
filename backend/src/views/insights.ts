import { dailyUse, daysLeft, reportOutcome, summariseAdherence, type DoseStatus, type MissClass, type ReportOutcome, type SlotName } from "@dosecircle/shared";

/**
 * Analytics for one parent over a period, shaped for the family dashboard. Pure: callers pass doses and
 * medicines, so the same code serves real families, the demo and tests.
 *
 * Adherence counts doses taken (on time or late) out of doses whose outcome is known. A dose whose
 * reminder never reached the phone is "unknown" and never counts as missed.
 */

export interface InsightDose {
  doseId: string;
  slotName: SlotName;
  medIds: readonly string[];
  status: DoseStatus;
  missClass?: MissClass | null;
  scheduledAt: string;
  deliveredAt?: string;
  takenAt?: string;
  escalatedAt?: string;
  claimedAt?: string;
  claimedBy?: string;
  alertedMemberIds?: Iterable<string>;
}

export interface InsightMedicine {
  medId: string;
  nameAsPrinted: string;
  strength: string | null;
  slots: Partial<Record<string, number | null>>;
  asNeeded: boolean;
  active: boolean;
  pillsLeft: number | null;
  refillThresholdDays: number;
}

export interface InsightMember {
  mid: string;
  displayName: string;
}

export type Highlight =
  | { code: "improving" }
  | { code: "declining" }
  | { code: "strong_week" }
  | { code: "slot_slipping"; slotName: SlotName }
  | { code: "irregular_timing" }
  | { code: "refill_soon"; medId: string; nameAsPrinted: string }
  | { code: "phone_offline_often" };

export interface Insights {
  range: { from: string; to: string; days: number };
  headline: {
    adherence: number | null;
    previousAdherence: number | null;
    onTime: number;
    late: number;
    missed: number;
    unknown: number;
    currentStreak: number;
    bestStreak: number;
  };
  daily: { date: string; onTime: number; late: number; missed: number; unknown: number; adherence: number | null }[];
  calendar: { times: string[]; days: { date: string; cells: Record<string, ReportOutcome> }[] };
  timing: { date: string; slotName: SlotName; delayMinutes: number; late: boolean }[];
  consistency: { medianDelayMinutes: number | null; spreadMinutes: number | null; previousSpreadMinutes: number | null; steady: boolean | null };
  weekdaySlots: { weekday: number; slotName: SlotName; doses: number; missed: number }[];
  medicines: { medId: string; nameAsPrinted: string; strength: string | null; adherence: number | null; onTime: number; late: number; missed: number; unknown: number }[];
  escalation: { doses: number; parentOnTime: number; parentLate: number; claimedBy: { mid: string; displayName: string; position: number; count: number }[]; unresolved: number };
  responders: { mid: string; displayName: string; position: number; alerted: number; claims: number; medianMinutesToClaim: number | null }[];
  delays: { bucket: "early" | "0-15" | "16-30" | "31-60" | "60+"; count: number }[];
  refills: { medId: string; nameAsPrinted: string; pillsLeft: number; perDay: number; daysLeft: number; runOutDate: string; thresholdDays: number }[];
  reachability: { date: string; reminders: number; reached: number }[];
  highlights: Highlight[];
}

const DAY_MS = 86_400_000;
const TZ = "Asia/Kolkata";

/**
 * Built once, not per call. `Intl.DateTimeFormat` holds native ICU memory that V8 has no reason to
 * collect promptly, and these run for every dose on several passes. Constructing them inside the
 * helpers leaked well over a hundred megabytes per request on Lambda: a warm container climbed to
 * its memory limit over a handful of dashboard loads and then stalled until the timeout.
 */
const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const IST_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const IST_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function istDateOf(iso: string | number | Date): string {
  return IST_DATE.format(new Date(iso));
}

function istHhmm(iso: string): string {
  return IST_HHMM.format(new Date(iso)).replace(":", "");
}

function istWeekday(iso: string): number {
  return WEEKDAY_NAMES.indexOf(IST_WEEKDAY.format(new Date(iso)));
}

function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Interquartile range: how spread out dose times are, ignoring the odd outlier. */
export function spread(values: readonly number[]): number | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    const pos = (sorted.length - 1) * q;
    const lower = Math.floor(pos);
    return sorted[lower]! + (sorted[Math.ceil(pos)]! - sorted[lower]!) * (pos - lower);
  };
  return Math.round(at(0.75) - at(0.25));
}

const counted = (o: ReportOutcome) => o === "on_time" || o === "late" || o === "missed" || o === "unknown";
const taken = (o: ReportOutcome) => o === "on_time" || o === "late";

/** Doses taken more than this long after the reminder are irregular enough to flag. */
export const STEADY_SPREAD_MINUTES = 30;

export function buildInsights(input: {
  doses: readonly InsightDose[];
  previousDoses: readonly InsightDose[];
  medicines: readonly InsightMedicine[];
  ladder: readonly InsightMember[];
  to: string;
  days: number;
  now?: number;
}): Insights {
  const toMs = Date.parse(`${input.to}T12:00:00+05:30`);
  const dates = Array.from({ length: input.days }, (_, i) => istDateOf(toMs - (input.days - 1 - i) * DAY_MS));
  const inRange = new Set(dates);
  const doses = input.doses.filter((d) => inRange.has(istDateOf(d.scheduledAt))).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const outcomes = doses.map((d) => ({ dose: d, outcome: reportOutcome(d) }));
  const summary = summariseAdherence(outcomes.map((o) => o.outcome));
  const previous = summariseAdherence(input.previousDoses.map((d) => reportOutcome(d)));

  // Streaks count consecutive taken doses; an unknown (phone offline) dose neither breaks nor extends one.
  let current = 0;
  let best = 0;
  let run = 0;
  for (const { outcome } of outcomes) {
    if (taken(outcome)) best = Math.max(best, ++run);
    else if (outcome === "missed") run = 0;
  }
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const outcome = outcomes[i]!.outcome;
    if (taken(outcome)) current++;
    else if (outcome === "missed") break;
  }

  const daily = dates.map((date) => {
    const day = summariseAdherence(outcomes.filter((o) => istDateOf(o.dose.scheduledAt) === date).map((o) => o.outcome));
    return { date, onTime: day.onTime, late: day.late, missed: day.missed, unknown: day.unknown, adherence: day.adherence };
  });

  const times = [...new Set(doses.map((d) => istHhmm(d.scheduledAt)))].sort();
  const calendar = {
    times,
    days: dates.map((date) => ({
      date,
      cells: Object.fromEntries(outcomes.filter((o) => istDateOf(o.dose.scheduledAt) === date && counted(o.outcome)).map((o) => [istHhmm(o.dose.scheduledAt), o.outcome])) as Record<string, ReportOutcome>,
    })),
  };

  const timing = outcomes
    .filter((o) => taken(o.outcome) && o.dose.takenAt)
    .map((o) => ({ date: istDateOf(o.dose.scheduledAt), slotName: o.dose.slotName, delayMinutes: Math.max(-60, minutesBetween(o.dose.scheduledAt, o.dose.takenAt!)), late: o.outcome === "late" }));
  const previousDelays = input.previousDoses.filter((d) => d.takenAt && taken(reportOutcome(d))).map((d) => minutesBetween(d.scheduledAt, d.takenAt!));
  const delays = timing.map((t) => t.delayMinutes);
  const spreadMinutes = spread(delays);
  const consistency = {
    medianDelayMinutes: median(delays),
    spreadMinutes,
    previousSpreadMinutes: spread(previousDelays),
    steady: spreadMinutes === null ? null : spreadMinutes <= STEADY_SPREAD_MINUTES,
  };

  const slotKey = (weekday: number, slot: SlotName) => `${weekday}|${slot}`;
  const weekdayMap = new Map<string, { weekday: number; slotName: SlotName; doses: number; missed: number }>();
  for (const { dose, outcome } of outcomes) {
    if (!counted(outcome) || outcome === "unknown") continue;
    const weekday = istWeekday(dose.scheduledAt);
    const entry = weekdayMap.get(slotKey(weekday, dose.slotName)) ?? { weekday, slotName: dose.slotName, doses: 0, missed: 0 };
    entry.doses++;
    if (outcome === "missed") entry.missed++;
    weekdayMap.set(slotKey(weekday, dose.slotName), entry);
  }
  const weekdaySlots = [...weekdayMap.values()].sort((a, b) => a.weekday - b.weekday || a.slotName.localeCompare(b.slotName));

  const medicines = input.medicines
    .map((m) => {
      const s = summariseAdherence(outcomes.filter((o) => o.dose.medIds.includes(m.medId)).map((o) => o.outcome));
      return { medId: m.medId, nameAsPrinted: m.nameAsPrinted, strength: m.strength, adherence: s.adherence, onTime: s.onTime, late: s.late, missed: s.missed, unknown: s.unknown };
    })
    .filter((m) => m.onTime + m.late + m.missed + m.unknown > 0)
    .sort((a, b) => (a.adherence ?? 1) - (b.adherence ?? 1));

  const positionOf = (mid: string) => input.ladder.findIndex((m) => m.mid === mid) + 1;
  const nameOf = (mid: string) => input.ladder.find((m) => m.mid === mid)?.displayName ?? "";
  const resolved = outcomes.filter((o) => counted(o.outcome));
  const claimCounts = new Map<string, number>();
  for (const { dose } of resolved) if (dose.status === "CLAIMED" && dose.claimedBy) claimCounts.set(dose.claimedBy, (claimCounts.get(dose.claimedBy) ?? 0) + 1);
  const escalation = {
    doses: resolved.length,
    parentOnTime: resolved.filter((o) => o.dose.status === "TAKEN").length,
    parentLate: resolved.filter((o) => o.dose.status === "TAKEN_LATE").length,
    claimedBy: [...claimCounts.entries()].map(([mid, count]) => ({ mid, displayName: nameOf(mid), position: positionOf(mid), count })).sort((a, b) => a.position - b.position),
    unresolved: resolved.filter((o) => o.dose.status === "UNRESOLVED").length,
  };

  const responders = input.ladder.map((member, index) => {
    const alerted = doses.filter((d) => new Set(d.alertedMemberIds ?? []).has(member.mid));
    const claims = doses.filter((d) => d.claimedBy === member.mid && d.claimedAt);
    return {
      mid: member.mid,
      displayName: member.displayName,
      position: index + 1,
      alerted: alerted.length,
      claims: claims.length,
      medianMinutesToClaim: median(claims.map((d) => minutesBetween(d.escalatedAt ?? d.scheduledAt, d.claimedAt!))),
    };
  });

  const bucketOf = (m: number): Insights["delays"][number]["bucket"] => (m <= 0 ? "early" : m <= 15 ? "0-15" : m <= 30 ? "16-30" : m <= 60 ? "31-60" : "60+");
  const buckets: Insights["delays"][number]["bucket"][] = ["early", "0-15", "16-30", "31-60", "60+"];
  const delayHistogram = buckets.map((bucket) => ({ bucket, count: delays.filter((m) => bucketOf(m) === bucket).length }));

  const today = input.to;
  const refills = input.medicines
    .filter((m) => m.active && !m.asNeeded && m.pillsLeft !== null)
    .map((m) => {
      const perDay = dailyUse({ slots: m.slots, asNeeded: m.asNeeded });
      const left = daysLeft(m.pillsLeft ?? 0, perDay);
      return left === null
        ? null
        : { medId: m.medId, nameAsPrinted: m.nameAsPrinted, pillsLeft: m.pillsLeft ?? 0, perDay, daysLeft: left, runOutDate: istDateOf(Date.parse(`${today}T12:00:00+05:30`) + left * DAY_MS), thresholdDays: m.refillThresholdDays };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const reachability = dates.map((date) => {
    const reminders = doses.filter((d) => istDateOf(d.scheduledAt) === date && d.status !== "SKIPPED");
    return { date, reminders: reminders.length, reached: reminders.filter((d) => d.deliveredAt).length };
  });

  const highlights: Highlight[] = [];
  if (summary.adherence !== null && previous.adherence !== null) {
    const change = summary.adherence - previous.adherence;
    if (change >= 0.05) highlights.push({ code: "improving" });
    if (change <= -0.05) highlights.push({ code: "declining" });
  }
  const lastWeek = new Set(dates.slice(-7));
  const lastWeekMisses = outcomes.filter((o) => lastWeek.has(istDateOf(o.dose.scheduledAt)) && o.outcome === "missed").length;
  if (lastWeekMisses === 0 && (summary.adherence ?? 0) >= 0.9 && doses.length > 0) highlights.push({ code: "strong_week" });
  const bySlot = new Map<SlotName, { doses: number; missed: number }>();
  for (const entry of weekdaySlots) {
    const slot = bySlot.get(entry.slotName) ?? { doses: 0, missed: 0 };
    slot.doses += entry.doses;
    slot.missed += entry.missed;
    bySlot.set(entry.slotName, slot);
  }
  for (const [slotName, slot] of bySlot) if (slot.missed >= 2 && slot.missed / slot.doses >= 0.15) highlights.push({ code: "slot_slipping", slotName });
  if (consistency.steady === false) highlights.push({ code: "irregular_timing" });
  for (const refill of refills) if (refill.daysLeft <= refill.thresholdDays) highlights.push({ code: "refill_soon", medId: refill.medId, nameAsPrinted: refill.nameAsPrinted });
  if (summary.unknown >= 2) highlights.push({ code: "phone_offline_often" });

  return {
    range: { from: dates[0]!, to: dates[dates.length - 1]!, days: input.days },
    headline: { adherence: summary.adherence, previousAdherence: previous.adherence, onTime: summary.onTime, late: summary.late, missed: summary.missed, unknown: summary.unknown, currentStreak: current, bestStreak: best },
    daily,
    calendar,
    timing,
    consistency,
    weekdaySlots,
    medicines,
    escalation,
    responders,
    delays: delayHistogram,
    refills,
    reachability,
    highlights,
  };
}
