import { ArrowRight, BellRing, CalendarClock, Database, Hand, Lock, MessageSquareWarning, Network, ScanText, ShieldCheck, Smartphone, Users, WifiOff, Workflow, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { FamilyAlert } from "../components/FamilyAlert";
import { FamilyCircle, type CircleStage } from "../components/FamilyCircle";
import { InsightsGrid, InsightsHero } from "../components/InsightsDashboard";
import { Logo } from "../components/Logo";
import { ParentDoseScreen } from "../components/ParentDoseScreen";
import { PhoneFrame } from "../components/PhoneFrame";
import { ThemeToggle } from "../components/ThemeToggle";
import { cx } from "../components/ui";
import { demoInsights } from "../lib/demo-insights";
import { pairedDevice } from "../lib/device";
import type { DoseView, OpenAlert } from "../lib/types";

/** The hero loops through a whole escalation so the idea lands before anyone reads a word. */
const LOOP: { stage: CircleStage; alerted: string[]; claimed: string | null; ms: number }[] = [
  { stage: "reminding", alerted: [], claimed: null, ms: 2600 },
  { stage: "checking", alerted: [], claimed: null, ms: 1600 },
  { stage: "alerting", alerted: ["arjun"], claimed: null, ms: 2600 },
  { stage: "alerting", alerted: ["arjun", "meera"], claimed: null, ms: 2400 },
  { stage: "claimed", alerted: ["arjun", "meera"], claimed: "meera", ms: 3600 },
];

const CAPTIONS: Record<string, string> = {
  reminding: "8:00 · Amma's reminder rings, in Kannada.",
  checking: "No tap. Did the reminder reach her phone?",
  alerting: "It did. The family is asked one at a time.",
  claimed: "Meera takes it. Arjun is told to stand down.",
};

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

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: BellRing, title: "A reminder, in her language", body: "At the time the family set, with medicine names exactly as printed on the strip and one large button to confirm." },
  { icon: WifiOff, title: "Missed or offline, told apart", body: "The phone confirms each reminder arrived. If it never did, the family hears “phone seems offline”, not a false alarm." },
  { icon: Users, title: "One person asked at a time", body: "The family chooses the order. If the first person doesn't respond in time, the next is asked, then everyone." },
  { icon: Hand, title: "One tap to take responsibility", body: "Whoever says “I'll handle it” claims the dose, and everyone else stands down. No five calls to Amma." },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
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
  checks: [],
  voice: { src: "", thanks: "" },
};
const showcaseAlert = (status: OpenAlert["status"]): OpenAlert => ({
  doseId: "showcase",
  pid: "p",
  parentName: "Shantha",
  slotName: "morning",
  scheduledAt: minutesAgo(32),
  status,
  missClass: "MISSED",
  critical: false,
  alertedMe: true,
  alertedCount: 2,
  claimedByName: status === "CLAIMED" ? "Meera" : null,
});
const LADDER = [
  { mid: "arjun", displayName: "Arjun" },
  { mid: "meera", displayName: "Meera" },
];

const ARCHITECTURE: { icon: LucideIcon; name: string; role: string }[] = [
  { icon: CalendarClock, name: "EventBridge Scheduler", role: "Starts a workflow for every dose, in India time" },
  { icon: Workflow, name: "Step Functions", role: "Waits for a tap, then escalates one person at a time" },
  { icon: Network, name: "Lambda + API Gateway", role: "Sends pushes, records taps and claims" },
  { icon: Database, name: "DynamoDB", role: "Conditional writes so only one person can claim" },
  { icon: Lock, name: "Verified Permissions", role: "Cedar policies authorise every action" },
  { icon: ScanText, name: "Textract + Bedrock", role: "Reads prescriptions; a person confirms every line" },
];

export function LandingPage() {
  const device = pairedDevice();
  const frame = useLoop();
  const insights = useMemo(() => demoInsights(30), []);

  return (
    <div className="overflow-x-clip bg-paper">
      {/* Hero */}
      <section className="hero-surface relative">
        <div aria-hidden className="hero-grid absolute inset-0" />
        <header className="relative mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 md:px-8">
          <Logo className="size-9 rounded-[10px] ring-1 ring-white/20" />
          <span className="text-lg font-semibold tracking-tight text-white">DoseCircle</span>
          <nav className="ml-auto flex items-center gap-1.5">
            {device && (
              <Link to="/parent" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-white hover:bg-white/10 sm:inline-flex">
                <Smartphone aria-hidden className="size-4" /> My medicines
              </Link>
            )}
            <Link to="/signin" className="inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">
              Family sign in
            </Link>
            <ThemeToggle className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10" />
          </nav>
        </header>

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-10 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
          <div>
            <p className="inline-flex flex-wrap items-center gap-2 rounded-full bg-white/8 py-1 pl-1 pr-3 text-[13.5px] font-medium text-hero-muted ring-1 ring-white/15">
              <span className="rounded-full bg-haldi px-2.5 py-0.5 font-semibold text-[#14133a]">Built on AWS</span>
              <span lang="kn">ಕನ್ನಡ</span>·<span lang="hi">हिन्दी</span>·<span>English</span>
            </p>
            <h1 className="font-display mt-6 text-[48px] text-white sm:text-6xl xl:text-[76px]">
              When Amma misses her medicine, <span className="text-haldi">the right person knows.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-hero-muted md:text-xl">
              Families spread across cities worry whether their parents took their tablets. DoseCircle reminds Amma in her own language, notices a missed dose, and asks the family one person at a time until someone takes responsibility.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/demo" className="pressable inline-flex min-h-14 items-center gap-2.5 rounded-xl bg-haldi px-6 text-[17px] font-semibold text-[#14133a] shadow-[0_10px_30px_-10px_rgb(244_180_0/0.7)]">
                Watch the live demo <ArrowRight aria-hidden className="size-5" />
              </Link>
              <Link to="/signin" className="pressable inline-flex min-h-14 items-center rounded-xl px-6 text-[17px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">
                Set up your family
              </Link>
            </div>
          </div>

          <div className="glass-card relative p-4 md:p-6">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-hero-muted">
                <span className="size-2 animate-pulse rounded-full bg-haldi" /> Live escalation
              </p>
              <p className="text-[13px] text-hero-muted">Mysuru → Bengaluru → Pune</p>
            </div>
            <FamilyCircle
              parent={{ id: "amma", name: "Shantha", role: "Amma · Mysuru" }}
              members={[
                { id: "arjun", name: "Arjun", role: "Son" },
                { id: "meera", name: "Meera", role: "Daughter" },
              ]}
              stage={frame.stage}
              alertedIds={frame.alerted}
              claimedById={frame.claimed}
              parentOffline={false}
              missClass="MISSED"
            />
            <motion.p key={frame.stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-7 px-1 text-center text-[15px] font-medium text-white">
              {CAPTIONS[frame.stage]}
            </motion.p>
          </div>
        </div>

        <div className="relative border-t border-white/10">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 md:grid-cols-4 md:px-8">
            {[
              { value: "₹2.5", label: "per parent, per month on AWS" },
              { value: "1 tap", label: "to take responsibility and stand everyone else down" },
              { value: "13", label: "Cedar policies checked on every request" },
              { value: "3", label: "languages, each reviewed by native speakers" },
            ].map((stat) => (
              <div key={stat.label} className="py-6 md:py-8">
                <dt className="tabular text-3xl font-semibold tracking-tight text-white md:text-4xl">{stat.value}</dt>
                <dd className="mt-1 text-[14px] text-hero-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* How it works */}
      <Section eyebrow="How it works" title="Built for the moment a dose is missed">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="sticker relative bg-surface p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-indigo text-white">
                  <step.icon aria-hidden className="size-5" />
                </span>
                <span className="tabular text-[13px] font-semibold text-muted">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Analytics */}
      <section className="border-y border-line bg-sunken/60">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-24">
          <SectionHeading eyebrow="For the family" title="Know how Amma is really doing" body="Thirty days at a glance: doses taken against the 80% clinical benchmark, a dose calendar, timing drift that predicts missed doses, who responds and how fast, and when tablets run out." />
          <div className="pointer-events-none mt-10 select-none space-y-5" aria-hidden>
            <InsightsHero parentName="Shantha" lastReceiptAt={minutesAgo(26)} insights={insights} days={30} onDays={() => {}} lang="en" />
            <div className="relative max-h-[760px] overflow-hidden">
              <InsightsGrid insights={insights} lang="en" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-paper to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Three languages */}
      <Section
        eyebrow="Each person, their own language"
        title="Amma reads Kannada. Arjun reads English. Meera reads Hindi."
        body="These are the app's real screens, and medicine names are never translated. No sentence has a name or a number spliced into it, because Kannada inflects nouns and a spliced sentence is usually wrong."
      >
        {/* These three panes deliberately render the Kannada and Hindi drafts, which the app itself
            still hides: a section headed "each person, their own language" showing three English
            screens would be worse than useless. The note below says so plainly. */}
        <div className="grid gap-10 md:grid-cols-3" aria-hidden>
          <Showcase label="Amma · ಕನ್ನಡ">
            <ParentDoseScreen dose={SHOWCASE_DOSE} onTaken={async () => {}} framed showDraftLanguage />
          </Showcase>
          <Showcase label="Arjun · English">
            <div className="px-3 pt-3">
              <FamilyAlert alert={showcaseAlert("ESCALATING")} viewerLang="en" viewerMid="arjun" ladder={LADDER} alertedCount={2} onClaim={async () => "claimed"} onWhy={() => {}} />
            </div>
          </Showcase>
          <Showcase label="Meera · हिन्दी">
            <div className="px-3 pt-3">
              <FamilyAlert alert={showcaseAlert("CLAIMED")} viewerLang="hi" viewerMid="meera" ladder={LADDER} alertedCount={2} onClaim={async () => "claimed"} onWhy={() => {}} showDraftLanguage />
            </div>
          </Showcase>
        </div>
        <p className="mt-8 max-w-3xl text-[15px] text-hero-muted">
          The Kannada and Hindi above are <strong className="font-semibold text-white">drafts shown for illustration</strong>. In the app itself they
          stay hidden until a native speaker signs off every string, and until then those people see English rather than a
          translation nobody has checked. That gate is enforced by a test, not by good intentions.
        </p>
      </Section>

      {/* Architecture */}
      <section className="hero-surface relative">
        <div aria-hidden className="hero-grid absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-24">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-haldi">Built on AWS · Mumbai</p>
          <h2 className="font-display mt-3 max-w-3xl text-4xl text-white md:text-5xl">A serverless workflow that waits for free</h2>
          <p className="mt-4 max-w-2xl text-lg text-hero-muted">Each dose is a Step Functions execution. It is billed per step, not per minute, so waiting twenty minutes for Amma to tap costs nothing.</p>
          <ol className="mt-12 grid gap-3 md:grid-cols-3">
            {ARCHITECTURE.map((item, index) => (
              <li key={item.name} className="glass-card flex items-start gap-4 p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-haldi ring-1 ring-white/15">
                  <item.icon aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-[16px] font-semibold text-white">
                    <span className="tabular text-[12px] text-hero-muted">0{index + 1}</span>
                    {item.name}
                  </p>
                  <p className="mt-1 text-[14.5px] text-hero-muted">{item.role}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <Section eyebrow="Care, not just code" title="Designed to be trusted">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Every action authorised", body: "Who may see a parent or claim a dose is written as Cedar policies and checked by Amazon Verified Permissions on each request." },
            { icon: MessageSquareWarning, title: "Never medical advice", body: "Reminders and family alerts only. A guardrail removes anything resembling advice from AI-read prescriptions, and a person confirms every line." },
            { icon: Users, title: "No passwords for parents", body: "Amma's phone is connected with a one-time code from the family. It can be disconnected from the family app at any time." },
          ].map((item) => (
            <div key={item.title} className="sticker bg-surface p-6">
              <item.icon aria-hidden className="size-6 text-indigo-soft dark:text-haldi" />
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-indigo p-6 md:p-8">
          <p className="text-2xl font-semibold tracking-tight text-white">See a missed dose travel through a family.</p>
          <Link to="/demo" className="pressable inline-flex min-h-12 items-center gap-2 rounded-xl bg-haldi px-5 font-semibold text-[#14133a]">
            Open the live demo <ArrowRight aria-hidden className="size-5" />
          </Link>
        </div>
      </Section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-8 md:px-8">
          <Logo className="size-8" />
          <p className="font-semibold">DoseCircle</p>
          <p className="text-[14px] text-muted md:ml-auto">Reminders and family alerts only. DoseCircle does not give medical advice.</p>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-indigo-soft dark:text-haldi">{eyebrow}</p>
      <h2 className="font-display mt-3 text-4xl md:text-5xl">{title}</h2>
      {body && <p className="mt-4 text-lg text-muted">{body}</p>}
    </div>
  );
}

function Section({ eyebrow, title, body, children }: { eyebrow: string; title: string; body?: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-24">
      <SectionHeading eyebrow={eyebrow} title={title} body={body} />
      <div className="mt-12">{children}</div>
    </section>
  );
}

function Showcase({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="rounded-full bg-surface px-3.5 py-1 text-[14px] font-semibold ring-1 ring-line">{label}</span>
      <div className={cx("pointer-events-none w-full select-none")}>
        <PhoneFrame>{children}</PhoneFrame>
      </div>
    </div>
  );
}
