import { ArrowLeft, ArrowRight, Check, CircleAlert, Cloud, MessageCircle, RotateCcw, Smartphone, TriangleAlert, WifiOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import type { DoseView, OpenAlert, TimelineItem } from "../lib/types";
import { FamilyAlert } from "./FamilyAlert";
import { FamilyCircle } from "./FamilyCircle";
import { ParentDoseScreen } from "./ParentDoseScreen";
import { PhoneFrame } from "./PhoneFrame";
import { Timeline } from "./Timeline";
import { cx } from "./ui";

/*
 * The landing page's walkthrough: eight steps, each beside the screen it happens on.
 *
 * Every screen here is the app's real component fed fictional data, not a picture of one, so the
 * walkthrough cannot drift from what the app actually does. The names, the family and the
 * prescription are invented. Nothing here talks to a server.
 */

const at = (minutes: number) => {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
};

const DOSE: DoseView = {
  doseId: "story",
  status: "PENDING",
  slotName: "morning",
  scheduledAt: at(0),
  critical: false,
  parent: { displayName: "Shantha", lang: "kn" },
  medicines: [
    { medId: "a", nameAsPrinted: "Glycomet GP 1", strength: null, count: 1, food: "after", critical: false },
    { medId: "b", nameAsPrinted: "Telma 40", strength: "40 mg", count: 1, food: null, critical: false },
  ],
  checks: [],
  voice: { src: "", thanks: "" },
};

const LADDER = [
  { mid: "arjun", displayName: "Arjun" },
  { mid: "meera", displayName: "Meera" },
];

const alert = (status: OpenAlert["status"], claimedByName: string | null): OpenAlert => ({
  doseId: "story",
  pid: "amma",
  parentName: "Shantha",
  slotName: "morning",
  scheduledAt: at(0),
  status,
  missClass: "MISSED",
  critical: false,
  alertedMe: true,
  alertedCount: status === "CLAIMED" ? 2 : 1,
  claimedByName,
});

const TIMELINE: TimelineItem[] = [
  { at: at(0), kind: "reached_phone", people: ["Shantha"], sincePreviousSeconds: null },
  { at: at(20), kind: "nudge_sent", stateName: "NudgeParent", sincePreviousSeconds: 20 * 60 },
  { at: at(30), kind: "reminder_reached_phone", stateName: "WasReminderDelivered", sincePreviousSeconds: 10 * 60 },
  { at: at(30), kind: "member_alerted", stateName: "AlertFamilyMember", people: ["Arjun"], sincePreviousSeconds: 0 },
  { at: at(45), kind: "member_alerted", stateName: "AlertFamilyMember", people: ["Meera"], sincePreviousSeconds: 15 * 60 },
  { at: at(47), kind: "claimed", people: ["Meera"], authorizedBy: ["only-alerted-members-can-claim"], sincePreviousSeconds: 2 * 60 },
  { at: at(47), kind: "others_stood_down", stateName: "TellOthersToStandDown", sincePreviousSeconds: 0 },
];

interface Step {
  id: string;
  who: string;
  title: string;
  body: string;
  aws: string;
  screen: () => ReactNode;
  /** "phone" draws a phone around the screen; "panel" is a view from behind the scenes. */
  frame: "phone" | "panel";
}

const STEPS: Step[] = [
  {
    id: "setup",
    who: "Arjun's phone · English",
    title: "Arjun sets up the family",
    body: "From Bengaluru, Arjun adds his mother, picks Kannada for her reminders, and invites his sister Meera.",
    aws: "Amazon Cognito · sign-in",
    screen: () => <SetupScreen />,
    frame: "phone",
  },
  {
    id: "join",
    who: "Amma's phone · ಕನ್ನಡ",
    title: "Amma joins by scanning",
    body: "She points her camera at Arjun's code and types her name. No account and no password — her phone is the key.",
    aws: "One-time code · only its hash is stored",
    screen: () => <JoinScreen />,
    frame: "phone",
  },
  {
    id: "rx",
    who: "Arjun's phone · English",
    title: "Her medicines, from one photo",
    body: "Arjun photographs the prescription. Each line is read for him, and nothing is saved until he has checked every one.",
    aws: "Textract → Claude on Bedrock → Guardrail",
    screen: () => <PrescriptionScreen />,
    frame: "phone",
  },
  {
    id: "remind",
    who: "Amma's phone · ಕನ್ನಡ",
    title: "8:00 — the reminder rings, in Kannada",
    body: "Medicine names exactly as printed on the strip, never translated, and one large button to say she took them.",
    aws: "EventBridge Scheduler starts Step Functions",
    screen: () => <ParentDoseScreen dose={DOSE} onTaken={async () => {}} framed showDraftLanguage />,
    frame: "phone",
  },
  {
    id: "missed",
    who: "Behind the scenes",
    title: "No tap. Did it reach her phone?",
    body: "Her phone confirmed the reminder arrived, so this is a missed dose, not a phone that is switched off — and the family is told which.",
    aws: "Step Functions waits for the tap · waiting is free",
    screen: () => <MissedPanel />,
    frame: "panel",
  },
  {
    id: "ask",
    who: "Arjun's phone · English",
    title: "The family is asked, one at a time",
    body: "Arjun first, in English. If he can't respond in time, Meera is asked next, in Hindi — never everyone at once.",
    aws: "Lambda sends a web push",
    screen: () => (
      <div className="px-3 pt-3">
        <FamilyAlert alert={alert("ESCALATING", null)} viewerLang="en" viewerMid="arjun" ladder={LADDER} alertedCount={1} onClaim={async () => "claimed"} onWhy={() => {}} />
      </div>
    ),
    frame: "phone",
  },
  {
    id: "claim",
    who: "Meera's phone · हिन्दी",
    title: "Meera takes it. Arjun stands down.",
    body: "One tap on “I'll handle it”, and everyone else is told she has it. No five worried calls to Amma.",
    aws: "DynamoDB conditional write · one claim only",
    screen: () => (
      <div className="px-3 pt-3">
        <FamilyAlert alert={alert("CLAIMED", "Meera")} viewerLang="hi" viewerMid="meera" ladder={LADDER} alertedCount={2} onClaim={async () => "claimed"} onWhy={() => {}} showDraftLanguage />
      </div>
    ),
    frame: "phone",
  },
  {
    id: "why",
    who: "Arjun's phone · English",
    title: "Why was I alerted?",
    body: "Every step, when it happened, and the rule that allowed it. Nobody is left wondering why their phone buzzed.",
    aws: "Amazon Verified Permissions · Cedar",
    screen: () => <WhyScreen />,
    frame: "phone",
  },
];

/** `header` sits above the steps: beside the phone on a desktop, above everything on a phone. */
export function DemoStory({ header }: { header?: ReactNode }) {
  const [active, setActive] = useState(0);
  return (
    <>
      <DesktopStory active={active} onActive={setActive} header={header} />
      <div className="lg:hidden">
        {header}
        <div className="mt-8">
          <MobileStory active={active} onActive={setActive} />
        </div>
      </div>
    </>
  );
}

/**
 * Desktop: the whole walkthrough on one screen. The eight steps are a short list beside the phone;
 * the current one opens to show what happens, the others stay one line each. Scrolling eight
 * screen-heights to reach the end was the old version, and nobody got to step eight.
 */
function DesktopStory({ active, onActive, header }: { active: number; onActive: (index: number) => void; header?: ReactNode }) {
  const go = (index: number) => onActive(Math.max(0, Math.min(STEPS.length - 1, index)));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Arrow keys step through while the walkthrough is on screen, without stealing them elsewhere.
    const onKey = (event: KeyboardEvent) => {
      const box = root.current?.getBoundingClientRect();
      if (!box || box.bottom < 0 || box.top > window.innerHeight) return;
      if ((event.target as HTMLElement).closest("input,textarea,select")) return;
      if (event.key === "ArrowRight") go(active + 1);
      if (event.key === "ArrowLeft") go(active - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={root} className="hidden items-center gap-12 lg:grid lg:grid-cols-[1fr_340px]">
      <div>
        {header}
        <ol className="mt-5 space-y-1">
          {STEPS.map((step, index) => {
            const open = index === active;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => go(index)}
                  aria-current={open ? "step" : undefined}
                  className={cx("w-full rounded-2xl px-4 text-left transition-colors", open ? "bg-white py-3.5 shadow-[0_14px_36px_-20px_rgb(30_58_138/0.45)] ring-1 ring-slate-200" : "py-1.5 hover:bg-slate-50")}
                >
                  <span className="flex items-center gap-3">
                    <span className={cx("tabular grid size-7 shrink-0 place-items-center rounded-full text-[13.5px] font-semibold", open ? "bg-blue-600 text-white" : index < active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500")}>
                      {index < active ? <Check aria-hidden className="size-4" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className={cx("font-semibold tracking-tight", open ? "text-[20px] text-ink" : "text-[15.5px] text-slate-600")}>{step.title}</span>
                  </span>
                  {open && (
                    <span className="mt-1.5 block pl-10">
                      <span className="block text-[15.5px] leading-relaxed text-slate-600">{step.body}</span>
                      <span className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[13px] font-semibold text-blue-800 ring-1 ring-blue-100">
                          <Cloud aria-hidden className="size-3.5 shrink-0" />
                          {step.aws}
                        </span>
                        <span className="text-[13px] font-medium text-slate-500">{step.who}</span>
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <StepControls active={active} go={go} className="mt-4 pl-4" />
      </div>
      <Stage index={active} height={540} />
    </div>
  );
}

function StepControls({ active, go, className }: { active: number; go: (index: number) => void; className?: string }) {
  const last = active === STEPS.length - 1;
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <button type="button" onClick={() => go(active - 1)} disabled={active === 0} className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[16px] font-semibold text-ink ring-1 ring-slate-300 disabled:opacity-40">
        <ArrowLeft aria-hidden className="size-5" /> Back
      </button>
      <button type="button" onClick={() => go(last ? 0 : active + 1)} className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(37_99_235/0.8)] hover:bg-blue-700">
        {last ? (
          <>
            <RotateCcw aria-hidden className="size-4.5" /> Start again
          </>
        ) : (
          <>
            Next <ArrowRight aria-hidden className="size-5" />
          </>
        )}
      </button>
      <span className="tabular ml-1 text-[14px] font-medium text-slate-500">
        {active + 1} / {STEPS.length}
      </span>
    </div>
  );
}

/** Phones: one step at a time, with Back and Next, and a swipe across the screen. */
function MobileStory({ active, onActive }: { active: number; onActive: (index: number) => void }) {
  const reduce = useReducedMotion();
  const touchX = useRef<number | null>(null);
  const go = (index: number) => onActive(Math.max(0, Math.min(STEPS.length - 1, index)));

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="tabular text-[14px] font-semibold text-slate-500">
          Step {active + 1} of {STEPS.length}
        </p>
        <div className="flex gap-1.5" role="tablist" aria-label="Demo steps">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={`Step ${index + 1}: ${step.title}`}
              onClick={() => go(index)}
              className="grid size-6 place-items-center"
            >
              <span className={cx("block h-2 rounded-full transition-all", index === active ? "w-5 bg-blue-600" : "w-2 bg-slate-300")} />
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={STEPS[active]!.id} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
          <div className="mt-5 min-h-[196px]">
            <StepText step={STEPS[active]!} index={active} dim={false} />
          </div>
          <div
            className="mt-6"
            onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const start = touchX.current;
              const end = e.changedTouches[0]?.clientX;
              touchX.current = null;
              if (start === null || end === undefined || Math.abs(end - start) < 50) return;
              go(active + (end < start ? 1 : -1));
            }}
          >
            <Stage index={active} height={560} animate={false} />
          </div>
        </motion.div>
      </AnimatePresence>

      <StepControls active={active} go={go} className="mt-6 [&>button]:flex-1" />
    </div>
  );
}

function StepText({ step, index, dim }: { step: Step; index: number; dim: boolean }) {
  return (
    <div className={cx("max-w-lg transition-opacity duration-300", dim ? "opacity-30" : "opacity-100")}>
      <p className="flex items-center gap-3">
        <span className="tabular grid size-9 place-items-center rounded-full bg-blue-600 text-[15px] font-semibold text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.9)]">{index + 1}</span>
        <span className="text-[14px] font-semibold text-slate-500">{step.who}</span>
      </p>
      <h3 className="font-display mt-4 text-[28px] leading-tight tracking-tight md:text-[34px]">{step.title}</h3>
      <p className="mt-3 text-[17px] leading-relaxed text-slate-600">{step.body}</p>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[13.5px] font-semibold text-blue-800 ring-1 ring-blue-100">
        <Cloud aria-hidden className="size-4 shrink-0" />
        {step.aws}
      </p>
    </div>
  );
}

/** The screen for one step, faded in when the step changes. The screens are pictures here, not controls. */
function Stage({ index, height, animate = true }: { index: number; height: number; animate?: boolean }) {
  const reduce = useReducedMotion();
  const step = STEPS[index]!;
  const body = (
    <div aria-hidden className="pointer-events-none select-none">
      {step.frame === "phone" ? (
        <PhoneFrame height={height} className="mx-auto">
          <div className="h-full overflow-hidden">{step.screen()}</div>
        </PhoneFrame>
      ) : (
        <div className="mx-auto flex w-full max-w-[340px] flex-col justify-center rounded-[36px] bg-white p-5 shadow-[0_30px_70px_-30px_rgb(30_58_138/0.4)] ring-1 ring-slate-200" style={{ height: height + 20 }}>
          {step.screen()}
        </div>
      )}
    </div>
  );
  if (!animate || reduce) return body;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={step.id} initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.985 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        {body}
      </motion.div>
    </AnimatePresence>
  );
}

/* ——— The screens ——— */

function AppBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
      <span className="grid size-7 place-items-center rounded-lg bg-indigo text-[12px] font-bold text-white">D</span>
      <span className="text-[16px] font-semibold">{title}</span>
    </div>
  );
}

function SetupScreen() {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // A real-looking code that holds plain text, not a link: there is no family behind it to join.
    void QRCode.toDataURL("DOSECIRCLE-SAMPLE-K7Q4M2XP", { margin: 1, width: 200, color: { dark: "#14133a", light: "#ffffff" } }).then((url) => live && setQr(url));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-paper">
      <AppBar title="Your family" />
      <div className="space-y-3 p-3">
        <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">Who needs reminders</p>
          <div className="mt-2.5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-haldi-tint font-semibold">S</span>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold">Shantha</p>
              <p className="flex flex-wrap gap-1.5 text-[13px]">
                <span lang="kn" className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
                  ಕನ್ನಡ
                </span>
                <span className="rounded-full bg-due-tint px-2 py-0.5 font-medium text-due">Phone not connected yet</span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <p className="text-[15px] font-semibold">Connect Amma's phone</p>
          <p className="mt-0.5 text-[13px] text-muted">She points her camera at this code.</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid size-[112px] shrink-0 place-items-center rounded-xl bg-white ring-1 ring-line">{qr && <img src={qr} alt="" className="size-[100px]" />}</div>
            <div className="min-w-0 space-y-2">
              <p className="tabular rounded-lg bg-sunken px-2.5 py-1.5 text-center font-mono text-[17px] font-semibold tracking-[0.2em]">K7Q4-M2XP</p>
              <p className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-2 text-[13.5px] font-semibold text-white">
                <MessageCircle className="size-4" /> WhatsApp
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">Who is alerted, in order</p>
          {LADDER.map((person, index) => (
            <p key={person.mid} className="mt-2 flex items-center gap-2.5 text-[15px]">
              <span className="tabular grid size-6 place-items-center rounded-full bg-indigo text-[12.5px] font-semibold text-white">{index + 1}</span>
              <span className="font-semibold">{person.displayName}</span>
              <span className="text-muted">{index === 0 ? "Son · Bengaluru" : "Daughter · Pune"}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function JoinScreen() {
  const { t, lang } = useT("kn", true);
  return (
    <div className="flex h-full flex-col bg-paper px-4 pt-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-indigo text-[14px] font-bold text-white">D</span>
        <span className="text-lg font-semibold">DoseCircle</span>
      </div>
      <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p lang={lang} className="flex items-start gap-2 text-[17px] font-semibold leading-snug text-taken">
          <Check className="mt-1 size-5 shrink-0" strokeWidth={3} />
          {t("parent.join.done")}
        </p>
        <p lang={lang} className="mt-5 text-[23px] font-semibold leading-snug">
          {t("parent.setup.nameTitle")}
        </p>
        <p lang={lang} className="mt-1 text-[16px] text-muted">
          {t("parent.setup.nameHelp")}
        </p>
        <div className="mt-4 flex h-16 items-center rounded-2xl border-2 border-indigo bg-surface px-4 text-[28px] font-semibold">
          Shantha<span className="ml-0.5 h-8 w-[2px] animate-pulse bg-indigo" />
        </div>
        <p lang={lang} className="mt-4 grid min-h-14 place-items-center rounded-2xl bg-indigo text-[19px] font-semibold text-white">
          {t("onboard.next")}
        </p>
      </section>
    </div>
  );
}

function PrescriptionScreen() {
  const rows = [
    { name: "Glycomet GP 1", written: "1-0-1", when: "Morning · Night", level: "ok" as const },
    { name: "Telma 40", written: "1-0-0", when: "Morning", level: "ok" as const },
    { name: "Lantus 10 units", written: "HS", when: "Night", level: "check" as const },
  ];
  return (
    <div className="flex h-full flex-col bg-paper">
      <AppBar title="Check each medicine" />
      <div className="space-y-2.5 p-3">
        <div className="relative h-[132px] overflow-hidden rounded-xl bg-white ring-1 ring-line">
          <img src="/demo/sample-prescription.svg" alt="" className="w-full object-cover object-top" />
          <span className="absolute bottom-2 left-2 rounded-full bg-ink/85 px-2.5 py-1 text-[12.5px] font-semibold text-white">Sample · fictional names</span>
        </div>
        {rows.map((row) => (
          <div key={row.name} className={cx("rounded-xl bg-surface p-3 ring-1", row.level === "check" ? "ring-due/40" : "ring-line")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p lang="en" className="medicine-name text-[16px] font-semibold">
                  {row.name}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Written <span className="font-mono font-semibold text-ink">{row.written}</span> → {row.when}
                </p>
              </div>
              {row.level === "check" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-due-tint px-2 py-0.5 text-[12.5px] font-semibold text-due">
                  <TriangleAlert className="size-3.5" /> Check
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-taken-tint px-2 py-0.5 text-[12.5px] font-semibold text-taken">
                  <Check className="size-3.5" strokeWidth={3} /> Checked
                </span>
              )}
            </div>
          </div>
        ))}
        <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-2.5 text-[13px] text-blue-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Save stays off until every line is checked.
        </p>
      </div>
    </div>
  );
}

function MissedPanel() {
  return (
    <div className="flex h-full flex-col justify-center">
      <FamilyCircle
        tone="light"
        parent={{ id: "amma", name: "Shantha", role: "Amma · Mysuru" }}
        members={[
          { id: "arjun", name: "Arjun", role: "Son" },
          { id: "meera", name: "Meera", role: "Daughter" },
        ]}
        stage="checking"
        alertedIds={[]}
        claimedById={null}
        parentOffline={false}
        missClass="MISSED"
      />
      <div className="mt-2 space-y-2.5">
        <div className="rounded-2xl bg-missed-tint/60 p-3.5 ring-1 ring-missed/25">
          <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
            <Smartphone className="size-4.5 shrink-0 text-taken" /> Reached her phone at 8:00
          </p>
          <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-missed">
            <ArrowRight className="size-4 shrink-0" /> A missed dose — the family is asked
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">If it had never arrived</p>
          <p className="mt-1 flex items-center gap-2 text-[14px] font-medium text-slate-600">
            <WifiOff className="size-4 shrink-0" /> “Her phone seems to be offline”
          </p>
        </div>
      </div>
    </div>
  );
}

function WhyScreen() {
  const { t } = useT("en");
  return (
    <div className="flex h-full flex-col bg-paper">
      <AppBar title={t("timeline.title")} />
      <div className="relative min-h-0 flex-1 overflow-hidden p-3">
        <Timeline items={TIMELINE} lang="en" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-paper to-transparent" />
      </div>
    </div>
  );
}
