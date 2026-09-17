import { ArrowRight, BellRing, Clock, Hand, IndianRupee, Languages, ShieldCheck, Smartphone, Users, WifiOff, Workflow } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FamilyAlert } from "../components/FamilyAlert";
import { FamilyCircle, type CircleStage } from "../components/FamilyCircle";
import { Character, type CharacterId, type Mood } from "../components/illustrations/Characters";
import { Garland, Rangoli } from "../components/illustrations/Festive";
import { Logo } from "../components/Logo";
import { ParentDoseScreen } from "../components/ParentDoseScreen";
import { PhoneFrame } from "../components/PhoneFrame";
import { cx } from "../components/ui";
import { pairedDevice } from "../lib/device";
import type { DoseView, OpenAlert } from "../lib/types";

/** The hero loops through a whole escalation so the idea lands before anyone reads a word. */
const LOOP: { stage: CircleStage; alerted: string[]; claimed: string | null; ms: number }[] = [
  { stage: "reminding", alerted: [], claimed: null, ms: 2600 },
  { stage: "checking", alerted: [], claimed: null, ms: 1800 },
  { stage: "alerting", alerted: ["arjun"], claimed: null, ms: 2600 },
  { stage: "alerting", alerted: ["arjun", "meera"], claimed: null, ms: 2400 },
  { stage: "claimed", alerted: ["arjun", "meera"], claimed: "meera", ms: 3400 },
];

function useLoop() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndex(LOOP.length - 1);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => (i + 1) % LOOP.length), LOOP[index]!.ms);
    return () => clearTimeout(timer);
  }, [index]);
  return LOOP[index]!;
}

const STEPS: { who: CharacterId; mood: Mood; tone: string; icon: typeof BellRing; title: string; body: string }[] = [
  { who: "amma", mood: "calm", tone: "bg-marigold-tint", icon: BellRing, title: "8:00. Amma's phone rings.", body: "In Kannada, with the tablet names exactly as printed on the strip, and one big green button." },
  { who: "amma", mood: "worried", tone: "bg-haldi-tint", icon: WifiOff, title: "No tap? We check why.", body: "If the reminder reached her phone, the dose was missed. If it never arrived, her phone is probably offline, and the family is told which." },
  { who: "arjun", mood: "worried", tone: "bg-sky-tint", icon: Users, title: "Arjun is asked first.", body: "The family chooses the order. If Arjun doesn't respond in time, Meera is asked, then everyone." },
  { who: "meera", mood: "happy", tone: "bg-rose-tint", icon: Hand, title: "Meera: “I'll handle it.”", body: "One tap claims it. Arjun is told to stand down, so nobody calls Amma five times and nobody assumes someone else did." },
];

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

const SHOWCASE_DOSE: DoseView = {
  doseId: "showcase",
  status: "PENDING",
  slotName: "morning",
  scheduledAt: minutesAgo(2),
  critical: false,
  parent: { displayName: "Shantha", lang: "kn" },
  medicines: [
    { medId: "a", nameAsPrinted: "Glycomet GP 1", strength: null, count: 1, food: "after", critical: false },
    { medId: "b", nameAsPrinted: "Telma 40", strength: "40 mg", count: 0.5, food: null, critical: false },
  ],
  voice: { src: "", thanks: "" },
};

const showcaseAlert = (status: OpenAlert["status"], alertedMe: boolean): OpenAlert => ({
  doseId: "showcase",
  pid: "p",
  parentName: "Shantha",
  slotName: "morning",
  scheduledAt: minutesAgo(32),
  status,
  missClass: "MISSED",
  critical: false,
  alertedMe,
  alertedCount: 2,
  claimedByName: status === "CLAIMED" ? "Meera" : null,
});
const LADDER = [
  { mid: "arjun", displayName: "Arjun" },
  { mid: "meera", displayName: "Meera" },
];

export function LandingPage() {
  const device = pairedDevice();
  const frame = useLoop();

  return (
    <div className="overflow-x-clip bg-paper">
      <div className="kolam relative">
        <Garland className="h-12 w-full" count={40} />
        <header className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-8">
          <Logo className="size-10" />
          <span className="text-2xl font-extrabold tracking-tight">DoseCircle</span>
          <nav className="ml-auto flex items-center gap-2">
            {device && (
              <Link to="/parent" className="hidden min-h-11 items-center gap-1.5 rounded-full px-3 font-bold sm:inline-flex">
                <Smartphone aria-hidden className="size-4.5" /> My medicines
              </Link>
            )}
            <Link to="/signin" className="pressable inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-surface px-4 font-bold shadow-[3px_3px_0_var(--color-ink)]">
              Family sign in
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-20 pt-8 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
          <div>
            <div className="flex flex-wrap gap-2">
              {[
                { text: "ಕನ್ನಡ", lang: "kn", cls: "bg-marigold -rotate-3" },
                { text: "हिन्दी", lang: "hi", cls: "bg-rose-tint rotate-2" },
                { text: "English", lang: "en", cls: "bg-sky-tint -rotate-1" },
              ].map((chip) => (
                <span key={chip.lang} lang={chip.lang} className={cx("rounded-full border-2 border-ink px-3.5 py-0.5 text-lg font-bold shadow-[2px_2px_0_var(--color-ink)]", chip.cls)}>
                  {chip.text}
                </span>
              ))}
            </div>
            <h1 className="font-display mt-6 text-[56px] sm:text-7xl xl:text-[88px]">
              When Amma misses her medicine, <span className="relative inline-block bg-haldi px-2">the right person</span> knows.
            </h1>
            <p className="mt-6 max-w-xl text-xl font-medium text-ink/80">
              Families spread across cities worry whether their parents took their tablets. DoseCircle reminds Amma in her own language, notices a missed dose, and asks the family one person at a time until someone takes responsibility.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/demo" className="pressable inline-flex min-h-16 items-center gap-3 rounded-[18px] border-[3px] border-ink bg-haldi px-7 text-2xl font-extrabold shadow-[5px_5px_0_var(--color-ink)]">
                Watch it live <ArrowRight aria-hidden className="size-6" strokeWidth={3} />
              </Link>
              <Link to="/signin" className="pressable inline-flex min-h-16 items-center rounded-[18px] border-[3px] border-ink bg-surface px-6 text-xl font-bold shadow-[5px_5px_0_var(--color-ink)]">
                Set up your family
              </Link>
            </div>
            <p className="mt-4 text-[15px] font-medium text-muted">The live demo is a fictional family running on the real AWS workflow at 60× speed.</p>
          </div>

          <div className="sticker relative bg-surface p-3 md:p-5">
            <span className="absolute -right-3 -top-4 rotate-6 rounded-full border-2 border-ink bg-rose px-3 py-1 text-[14px] font-extrabold text-white shadow-[2px_2px_0_var(--color-ink)]">Live escalation</span>
            <FamilyCircle
              parent={{ id: "amma", name: "Shantha", role: "Amma · Mysuru", character: "amma" }}
              members={[
                { id: "arjun", name: "Arjun", role: "Son", character: "arjun" },
                { id: "meera", name: "Meera", role: "Daughter", character: "meera" },
              ]}
              stage={frame.stage}
              alertedIds={frame.alerted}
              claimedById={frame.claimed}
              parentOffline={false}
              missClass="MISSED"
            />
          </div>
        </section>
      </div>

      {/* How it works: a four-panel strip */}
      <section className="border-y-[3px] border-ink bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <div className="flex items-center gap-4">
            <Rangoli size={52} />
            <h2 className="font-display text-5xl md:text-6xl">How one missed dose plays out</h2>
          </div>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className={cx("sticker relative p-5", step.tone, index % 2 === 0 ? "lg:-rotate-1" : "lg:rotate-1")}
              >
                <span className="absolute -left-3 -top-4 grid size-11 place-items-center rounded-full border-2 border-ink bg-ink text-xl font-extrabold text-haldi">{index + 1}</span>
                <div className="flex items-start justify-between">
                  <Character who={step.who} mood={step.mood} size={92} />
                  <step.icon aria-hidden className="mt-2 size-8" strokeWidth={2.5} />
                </div>
                <h3 className="mt-4 text-2xl font-extrabold leading-tight">{step.title}</h3>
                <p className="mt-2 text-[16px] font-medium">{step.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Three real screens, three languages */}
      <section className="kolam-light relative bg-indigo text-paper">
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-20 md:px-8">
          <p className="text-[15px] font-bold uppercase tracking-[0.2em] text-haldi">Each person, their own language</p>
          <h2 className="font-display mt-3 max-w-4xl text-5xl md:text-7xl">
            Amma reads Kannada. Arjun reads English. Meera reads Hindi.
          </h2>
          <p className="mt-5 max-w-2xl text-xl text-paper/85">These are the app's real screens. Every sentence is reviewed by a native speaker before it ships, and medicine names are never translated.</p>
          <div className="mt-14 grid gap-10 md:grid-cols-3" aria-hidden>
            <Showcase who="amma" label="Amma · ಕನ್ನಡ" tone="bg-marigold">
              <ParentDoseScreen dose={SHOWCASE_DOSE} onTaken={async () => {}} framed />
            </Showcase>
            <Showcase who="arjun" label="Arjun · English" tone="bg-sky-tint">
              <div className="px-4 pt-3">
                <FamilyAlert alert={showcaseAlert("ESCALATING", true)} viewerLang="en" viewerMid="arjun" ladder={LADDER} alertedCount={2} onClaim={async () => "claimed"} onWhy={() => {}} parentAvatar={<Character who="amma" mood="worried" size={52} />} />
              </div>
            </Showcase>
            <Showcase who="meera" label="Meera · हिन्दी" tone="bg-rose-tint">
              <div className="px-4 pt-3">
                <FamilyAlert alert={showcaseAlert("CLAIMED", true)} viewerLang="hi" viewerMid="meera" ladder={LADDER} alertedCount={2} onClaim={async () => "claimed"} onWhy={() => {}} parentAvatar={<Character who="amma" mood="happy" size={52} />} />
              </div>
            </Showcase>
          </div>
        </div>
      </section>

      {/* AWS and trust */}
      <section className="kolam">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <h2 className="font-display text-5xl md:text-6xl">Serious plumbing, friendly face</h2>
          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            <div className="sticker bg-haldi p-6 lg:row-span-2">
              <IndianRupee aria-hidden className="size-10" strokeWidth={2.5} />
              <p className="font-display mt-4 text-8xl">₹2.5</p>
              <p className="mt-2 text-2xl font-extrabold">per parent, per month</p>
              <p className="mt-4 text-[17px] font-medium">A Step Functions workflow waits for Amma's tap without costing anything while it waits. Billing is per step, not per minute, so a 20-minute wait is free.</p>
            </div>
            <Feature icon={Workflow} tone="bg-sky-tint" title="One workflow per dose">
              EventBridge Scheduler starts a Step Functions escalation for every dose, in India time. Each step you see in the demo is a real workflow state.
            </Feature>
            <Feature icon={ShieldCheck} tone="bg-mint-tint" title="Every action authorised">
              Who may claim a dose or see a parent is written as Cedar policies and checked by Amazon Verified Permissions on every request.
            </Feature>
            <Feature icon={Clock} tone="bg-rose-tint" title="Missed or offline, honestly">
              The phone confirms each reminder arrived, so the family hears “her phone seems offline” instead of a false alarm.
            </Feature>
            <Feature icon={Languages} tone="bg-indigo-tint" title="Languages done with care">
              Kannada first, reviewed by native speakers. No sentence is stitched together from words, and a missing translation falls back to English, never another language.
            </Feature>
          </div>
        </div>
      </section>

      <footer className="border-t-[3px] border-ink bg-ink text-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-8 md:px-8">
          <Logo className="size-9 rounded-[10px] ring-2 ring-paper" />
          <p className="text-lg font-bold">DoseCircle</p>
          <p className="text-[15px] text-paper/75 md:ml-auto">Reminders and family alerts only. DoseCircle does not give medical advice.</p>
        </div>
      </footer>
    </div>
  );
}

function Showcase({ who, label, tone, children }: { who: CharacterId; label: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -top-7 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        <Character who={who} size={56} />
        <span className={cx("whitespace-nowrap rounded-full border-2 border-ink px-3 py-1 text-[15px] font-extrabold text-ink shadow-[2px_2px_0_var(--color-ink)]", tone)}>{label}</span>
      </div>
      <div className="pointer-events-none select-none">
        <PhoneFrame>{children}</PhoneFrame>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, tone, title, children }: { icon: typeof Workflow; tone: string; title: string; children: React.ReactNode }) {
  return (
    <div className={cx("sticker p-6", tone)}>
      <span className="grid size-12 place-items-center rounded-2xl border-2 border-ink bg-surface">
        <Icon aria-hidden className="size-6" strokeWidth={2.5} />
      </span>
      <h3 className="mt-4 text-2xl font-extrabold">{title}</h3>
      <p className="mt-2 text-[17px] font-medium">{children}</p>
    </div>
  );
}
