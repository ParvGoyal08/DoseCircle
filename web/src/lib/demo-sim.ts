import { chooseLadder, timingsFor, type DoseStatus, type LanguageCode, type MissClass, type SlotName } from "@dosecircle/shared";
import en from "../../../shared/i18n/en.json";
import hi from "../../../shared/i18n/hi.json";
import kn from "../../../shared/i18n/kn.json";
import { config } from "./config";
import type { DemoClient } from "./demo-client";
import type { DemoSession, DemoState, InboxItem, MedicineLine, OpenAlert, Prescription, Timeline, TimelineItem, TimelineKind } from "./types";

/**
 * An in-browser stand-in for the AWS demo, used only when no API is configured (local development).
 * It follows the same state machine and 60× timings so screens behave as they will on AWS.
 * The page labels it "Offline simulation"; it is never used in the deployed app.
 */

type Catalogue = { strings: Record<string, { text: string; reviewedBy: string | null }> };
const PUSH: Record<string, Catalogue> = { en, kn, hi };
function push(lang: LanguageCode, key: string): { text: string; lang: string } {
  const entry = PUSH[lang]?.strings[key];
  if (entry && (entry.reviewedBy || config.showDraftLanguages)) return { text: entry.text, lang };
  return { text: en.strings[key as keyof typeof en.strings].text, lang: "en" };
}

const SPEED = 60;
const MEDICINES: Record<string, MedicineLine> = {
  glycomet: { medId: "med-glycomet", nameAsPrinted: "Glycomet GP 1", strength: null, count: 1, food: "after", critical: false },
  telma: { medId: "med-telma", nameAsPrinted: "Telma 40", strength: "40 mg", count: 1, food: null, critical: false },
  lantus: { medId: "med-lantus", nameAsPrinted: "Lantus", strength: "10 units", count: 1, food: null, critical: true },
};

interface SimDose {
  doseId: string;
  slotName: SlotName;
  scheduledAt: string;
  critical: boolean;
  status: DoseStatus;
  missClass: MissClass | null;
  claimedBy: string | null;
  deliveredAt: string | null;
  alerted: string[];
  medicines: MedicineLine[];
}

export function createSimulatedDemoClient(): DemoClient {
  let session: DemoSession | null = null;
  let dose: SimDose | null = null;
  let running = false;
  let runs = 0;
  let consecutiveMisses = 0;
  let generation = 0;
  let lastReceiptAt: string | null = null;
  let events: Omit<TimelineItem, "sincePreviousSeconds">[] = [];
  let inbox: Record<string, InboxItem[]> = {};
  let wake: (() => void) | null = null;

  const people = () => session!.members;
  const parentRecipient = () => `parent-${session!.parent.pid}`;
  const nameOf = (mid: string) => people().find((m) => m.mid === mid)?.displayName ?? mid;
  const now = () => new Date().toISOString();

  const deliver = (recipient: string, lang: LanguageCode, step: InboxItem["step"], title: string, bodyKey: string) => {
    const body = push(lang, bodyKey);
    (inbox[recipient] ??= []).push({ title, body: body.text, lang: body.lang, doseId: dose!.doseId, step, url: "", sig: "simulated", at: now() });
  };
  const record = (kind: TimelineKind, extra: Partial<TimelineItem> = {}) => events.push({ at: now(), kind, ...extra });

  /** Resolves after `seconds`, or earlier when an action wakes the workflow. Returns true on timeout. */
  const wait = (seconds: number, gen: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve(true);
      }, seconds * 1000);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve(gen !== generation);
      };
    });
  const resolved = () => dose!.status === "TAKEN" || dose!.status === "TAKEN_LATE" || dose!.status === "CLAIMED";

  async function run(gen: number) {
    const d = dose!;
    const ladder = timingsFor(chooseLadder({ critical: d.critical, consecutiveMisses }), SPEED);
    const stillCurrent = () => gen === generation;
    // Actions change the dose while this loop waits, so read the status through a function.
    const takenOnTime = () => d.status === "TAKEN";

    deliver(parentRecipient(), session!.parent.lang, "REMIND", push(session!.parent.lang, `push.remind.title.${d.slotName}`).text, "push.remind.body");
    record("reminder_sent", { stateName: "RemindParent" });
    await wait(ladder.parentWaitSeconds, gen);
    if (!stillCurrent()) return;
    if (takenOnTime()) return finish();
    record("no_confirmation", { stateName: "RemindParent" });

    if (ladder.nudgeWaitSeconds > 0) {
      deliver(parentRecipient(), session!.parent.lang, "NUDGE", push(session!.parent.lang, `push.remind.title.${d.slotName}`).text, "push.nudge.body");
      record("nudge_sent", { stateName: "NudgeParent" });
      await wait(ladder.nudgeWaitSeconds, gen);
      if (!stillCurrent()) return;
      if (takenOnTime()) return finish();
      record("no_confirmation", { stateName: "NudgeParent" });
    }

    d.missClass = d.deliveredAt ? "MISSED" : "OFFLINE";
    record(d.deliveredAt ? "reminder_reached_phone" : "phone_seemed_offline", { stateName: "WasReminderDelivered" });
    d.status = "ESCALATING";
    consecutiveMisses++;

    for (const member of people()) {
      d.alerted.push(member.mid);
      deliver(member.mid, member.lang, "ALERT", session!.parent.displayName, d.missClass === "OFFLINE" ? "push.alert.body.offline" : "push.alert.body.missed");
      record("member_alerted", { stateName: "AlertFamilyMember", people: [member.displayName] });
      await wait(ladder.claimWaitSeconds, gen);
      if (!stillCurrent()) return;
      if (resolved()) return finish();
    }

    for (const member of people()) deliver(member.mid, member.lang, "BROADCAST", session!.parent.displayName, "push.broadcast.body");
    record("family_alerted", { stateName: "AlertWholeFamily", people: people().map((m) => m.displayName) });
    await wait(ladder.finalWaitSeconds, gen);
    if (!stillCurrent()) return;
    if (resolved()) return finish();
    d.status = "UNRESOLVED";
    record("nobody_responded", { stateName: "NobodyResponded" });
    running = false;
  }

  function finish() {
    const d = dose!;
    if (d.status === "TAKEN") consecutiveMisses = 0;
    if (d.status === "CLAIMED") {
      for (const mid of d.alerted.filter((m) => m !== d.claimedBy)) deliver(mid, people().find((p) => p.mid === mid)!.lang, "STAND_DOWN", nameOf(d.claimedBy!), "push.standDown.body");
      record("others_stood_down", { stateName: "TellOthersToStandDown" });
    }
    if (d.status === "TAKEN_LATE") {
      for (const mid of d.alerted) deliver(mid, people().find((p) => p.mid === mid)!.lang, "TOOK_LATE", session!.parent.displayName, "push.tookLate.body");
      record("family_told_taken", { stateName: "TellFamilyParentTookIt" });
    }
    running = false;
  }

  const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 120));

  return {
    simulated: true,
    session: () => session,
    async start() {
      session = {
        token: "simulated",
        expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
        fid: "demo-simulated",
        parent: { pid: "p-demo", displayName: "Shantha", lang: "kn", city: "Mysuru" },
        members: [
          { mid: "m-son", role: "owner", displayName: "Arjun", relation: "Son", lang: "en", city: "Bengaluru" },
          { mid: "m-daughter", role: "member", displayName: "Meera", relation: "Daughter", lang: "hi", city: "Pune" },
        ],
      };
      lastReceiptAt = new Date(Date.now() - 13 * 3600_000).toISOString();
      return delay(session);
    },
    async state(): Promise<DemoState> {
      const alertsFor = (mid: string): OpenAlert[] =>
        dose && (dose.status === "ESCALATING" || dose.status === "CLAIMED")
          ? [
              {
                doseId: dose.doseId,
                pid: session!.parent.pid,
                parentName: session!.parent.displayName,
                slotName: dose.slotName,
                scheduledAt: dose.scheduledAt,
                status: dose.status,
                missClass: dose.missClass,
                critical: dose.critical,
                alertedMe: dose.alerted.includes(mid),
                claimedByName: dose.claimedBy ? nameOf(dose.claimedBy) : null,
              },
            ]
          : [];
      return delay({
        executionStatus: dose ? (running ? "RUNNING" : "SUCCEEDED") : null,
        runsLeft: 20 - runs,
        parent: { pid: session!.parent.pid, displayName: session!.parent.displayName, lang: session!.parent.lang, lastReceiptAt },
        members: people().map((m, index) => ({ mid: m.mid, displayName: m.displayName, relation: m.relation, lang: m.lang, role: m.role, position: index })),
        currentDose: dose
          ? {
              doseId: dose.doseId,
              status: dose.status,
              slotName: dose.slotName,
              scheduledAt: dose.scheduledAt,
              critical: dose.critical,
              parent: { displayName: session!.parent.displayName, lang: session!.parent.lang },
              medicines: dose.medicines,
              voice: { src: `/audio/${session!.parent.lang}/remind_${dose.slotName}.mp3`, thanks: `/audio/${session!.parent.lang}/taken_thanks.mp3` },
              missClass: dose.missClass,
              claimedBy: dose.claimedBy,
              claimedByName: dose.claimedBy ? nameOf(dose.claimedBy) : null,
            }
          : null,
        inbox: structuredClone(inbox),
        openAlertsByMember: Object.fromEntries(people().map((m) => [m.mid, alertsFor(m.mid)])),
      });
    },
    async sendDose({ critical }) {
      if (running) throw new Error("A dose is still in progress. Finish it or reset the demo.");
      runs++;
      generation++;
      events = [];
      inbox = {};
      dose = {
        doseId: `p-demo_${Date.now()}_${runs}`,
        slotName: critical ? "night" : "morning",
        scheduledAt: now(),
        critical,
        status: "PENDING",
        missClass: null,
        claimedBy: null,
        deliveredAt: null,
        alerted: [],
        medicines: critical ? [MEDICINES.glycomet!, MEDICINES.lantus!] : [MEDICINES.glycomet!, MEDICINES.telma!],
      };
      running = true;
      void run(generation);
      return delay({ doseId: dose.doseId });
    },
    async taken(doseId) {
      if (!dose || dose.doseId !== doseId) return;
      if (dose.status === "PENDING") dose.status = "TAKEN";
      else if (dose.status === "ESCALATING" || dose.status === "CLAIMED") dose.status = "TAKEN_LATE";
      else return;
      record("taken", { people: [session!.parent.displayName], authorizedBy: ["parent-phone-confirms-own-doses"] });
      if (running) wake?.();
      else if (dose.status === "TAKEN_LATE") finish();
      await delay(undefined);
    },
    async claim(doseId, asMemberId) {
      await delay(undefined);
      if (!dose || dose.doseId !== doseId || dose.status !== "ESCALATING" || !dose.alerted.includes(asMemberId)) return "lost";
      dose.status = "CLAIMED";
      dose.claimedBy = asMemberId;
      record("claimed", { people: [nameOf(asMemberId)], authorizedBy: ["only-alerted-members-can-claim"] });
      wake?.();
      return "claimed";
    },
    async receipt(item) {
      if (!dose || item.doseId !== dose.doseId) return;
      if ((item.step === "REMIND" || item.step === "NUDGE") && !dose.deliveredAt) {
        dose.deliveredAt = now();
        lastReceiptAt = dose.deliveredAt;
        record("reached_phone", { people: [session!.parent.displayName] });
      }
    },
    async timeline(doseId): Promise<Timeline> {
      const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
      return delay({
        doseId,
        parentName: session?.parent.displayName ?? "",
        slotName: dose?.slotName ?? "morning",
        scheduledAt: dose?.scheduledAt ?? now(),
        status: dose?.status ?? "PENDING",
        missClass: dose?.missClass ?? null,
        critical: dose?.critical ?? false,
        items: sorted.map((item, index) => ({ ...item, sincePreviousSeconds: index === 0 ? null : Math.round((Date.parse(item.at) - Date.parse(sorted[index - 1]!.at)) / 1000) })),
      });
    },
    async prescription(): Promise<Prescription> {
      // The same fixture the AWS demo serves, so both show identical rows.
      const { samplePrescription } = await import("../../../backend/src/demo/sample-prescription");
      return delay({ sample: true, status: "READY", guardrailInterventions: 0, ...samplePrescription() });
    },
    async reset() {
      generation++;
      wake?.();
      running = false;
      dose = null;
      events = [];
      inbox = {};
      runs = 0;
      consecutiveMisses = 0;
      session = null;
    },
  };
}
