import { ArrowDown, ArrowRight, Camera, KeyRound, ScanLine, Smartphone, UserPlus, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { FamilyCircle, type CircleStage } from "../components/FamilyCircle";
import { Logo } from "../components/Logo";
import { QrScanner } from "../components/QrScanner";
import { applyTheme, initialTheme } from "../components/ThemeToggle";
import { DemoStory } from "../components/DemoStory";
import { cx } from "../components/ui";
import { pairedDevice } from "../lib/device";

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

/**
 * The first page anyone sees is always white, whatever theme they chose inside the app: it is one
 * screen with one job, and it was designed in one light. Their own choice is put back on the way out.
 */
function useLightPage() {
  useEffect(() => {
    applyTheme("light");
    return () => applyTheme(initialTheme());
  }, []);
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

const AWS = ["EventBridge Scheduler", "Step Functions", "Lambda", "DynamoDB", "Verified Permissions", "Textract", "Bedrock", "Polly"];

export function LandingPage() {
  useLightPage();
  const device = pairedDevice();
  const frame = useLoop();
  const [scanning, setScanning] = useState(false);
  const reduce = useReducedMotion();
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="DoseCircle">
            <Logo className="size-8 rounded-[9px]" />
            <span className="hidden text-[17px] font-semibold tracking-tight min-[400px]:inline">DoseCircle</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1.5">
            {device && (
              <Link to="/parent" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-slate-600 hover:text-ink sm:inline-flex">
                <Smartphone aria-hidden className="size-4" /> My medicines
              </Link>
            )}
            <Link to="/signin" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3 text-[15px] font-semibold text-slate-600 hover:text-ink">
              Sign in
            </Link>
            <button type="button" onClick={() => scrollTo("start")} className="pressable inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-blue-600 px-4 text-[15px] font-semibold text-white shadow-[0_6px_16px_-8px_rgb(37_99_235/0.8)] hover:bg-blue-700">
              Get started
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        {/* One soft wash of blue behind the headline, and a faint dotted field — enough to give the
            white some depth without turning it into a gradient poster. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_80%_20%,rgb(219_234_254/0.9),transparent_70%),radial-gradient(45%_40%_at_5%_90%,rgb(239_246_255),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(37_99_235/0.10)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent_75%)]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 md:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28">
          <div>
            <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-3.5 pr-3.5 text-[13.5px] sm:pl-1.5 font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
              <span className="hidden whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700 sm:inline">For families</span>
              Reminders in <span lang="kn">ಕನ್ನಡ</span>, <span lang="hi">हिन्दी</span> and English
            </motion.p>
            <motion.h1 {...rise(0.05)} className="font-display mt-6 text-[42px] leading-[1.05] tracking-tight sm:text-6xl xl:text-[68px]">
              When Amma misses her medicine,{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">the right person knows.</span>
            </motion.h1>
            <motion.p {...rise(0.12)} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 md:text-xl">
              A reminder on her phone, in her own language. If she doesn't confirm it, the family is asked one person at a time until someone takes responsibility.
            </motion.p>
            <motion.div {...rise(0.18)} className="mt-9 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => scrollTo("demo")} className="pressable inline-flex min-h-14 items-center gap-2.5 rounded-2xl bg-blue-600 px-6 text-[17px] font-semibold text-white shadow-[0_14px_30px_-12px_rgb(37_99_235/0.75)] hover:bg-blue-700">
                See how it works <ArrowDown aria-hidden className="size-5" />
              </button>
              <button type="button" onClick={() => scrollTo("start")} className="pressable inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-[17px] font-semibold text-ink ring-1 ring-slate-300 hover:ring-blue-300">
                Get started
              </button>
            </motion.div>
          </div>

          <motion.div {...rise(0.1)} className="relative">
            <div aria-hidden className="absolute -inset-4 rounded-[36px] bg-gradient-to-br from-blue-100/70 via-white to-indigo-50/60 blur-2xl" />
            <div className="relative rounded-[28px] bg-white p-4 shadow-[0_30px_80px_-30px_rgb(30_58_138/0.35)] ring-1 ring-slate-200/80 md:p-6">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-60 motion-reduce:hidden" />
                    <span className="relative inline-flex size-2 rounded-full bg-blue-600" />
                  </span>
                  A missed dose, start to finish
                </p>
                <p className="hidden text-[13px] text-slate-500 sm:block">Mysuru · Bengaluru · Pune</p>
              </div>
              <FamilyCircle
                tone="light"
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
              <motion.p key={frame.stage} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="min-h-7 px-1 text-center text-[15px] font-medium text-slate-700">
                {CAPTIONS[frame.stage]}
              </motion.p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Get started */}
      <section id="start" className="scroll-mt-20 border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-24">
          <Heading eyebrow="Get started" title="Two ways in, depending on who you are" />
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* The person taking the medicines never makes an account. The family's invite is a QR
                code that opens /join with the code already filled in, so a phone's own camera app is
                the scanner — nothing to install, and it works the same on Android and iPhone. */}
            <article className="relative overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_20px_60px_-30px_rgb(30_58_138/0.3)] ring-1 ring-slate-200 md:p-8">
              <div className="flex items-start gap-5">
                <QrArt />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-blue-700">If you take the medicines</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">Scan to join your family</h3>
                </div>
              </div>
              <ol className="mt-6 space-y-3">
                {[
                  { icon: Camera, text: "Open your phone's camera and point it at the code your family shows you." },
                  { icon: ScanLine, text: "Tap the link that appears. Your family's code is already filled in." },
                  { icon: KeyRound, text: "Type your name. That's all — no account and no password." },
                ].map((step, index) => (
                  <li key={step.text} className="flex items-start gap-3.5">
                    <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[14px] font-semibold text-blue-700 ring-1 ring-blue-100">{index + 1}</span>
                    <p className="pt-1 text-[16px] leading-snug text-slate-700">{step.text}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setScanning(true)} className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(37_99_235/0.8)] hover:bg-blue-700">
                  <ScanLine aria-hidden className="size-5" /> Scan the code now
                </button>
                <Link to="/join" className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-50 px-5 text-[16px] font-semibold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100">
                  Type a code instead
                </Link>
              </div>
              {scanning && <QrScanner lang="en" onClose={() => setScanning(false)} />}
            </article>

            <article className="flex flex-col rounded-[28px] bg-white p-6 shadow-[0_20px_60px_-30px_rgb(30_58_138/0.3)] ring-1 ring-slate-200 md:p-8">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-blue-700">If you look after someone</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">Set up your family</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-slate-600">
                Add the person you care for and their medicines, then invite the rest of the family. Everyone is alerted in the order you choose.
              </p>
              <div className="mt-auto grid gap-3 pt-7">
                <EntryLink to="/signin?mode=create" icon={UserPlus} primary title="Create a family account" note="Email and password · about two minutes" />
                <EntryLink to="/signin" icon={KeyRound} title="Sign in" note="Already set up? Welcome back." />
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Demo — heading and walkthrough fit one screen together, so nobody scrolls to follow it. */}
      <section id="demo" className="scroll-mt-16 border-t border-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:flex lg:min-h-[calc(100svh-4rem)] lg:flex-col lg:justify-center lg:py-6">
          <DemoStory
            header={
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-blue-700">How it works</p>
                <h2 className="font-display mt-2 text-[30px] leading-tight tracking-tight md:text-[34px]">One missed dose, start to finish</h2>
                <p className="mt-2 text-[16px] text-slate-600">Amma reads Kannada, Arjun English, Meera Hindi. The app's real screens, with an invented family.</p>
              </div>
            }
          />
        </div>
      </section>

      {/* A single line of the architecture — the demo shows what each part does. */}
      <section className="border-t border-slate-100 bg-slate-50/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:px-6">
          <p className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500">Built on AWS · Mumbai</p>
          <ul className="flex flex-wrap gap-2">
            {AWS.map((name) => (
              <li key={name} className="rounded-full bg-white px-3 py-1.5 text-[14px] font-medium text-slate-700 ring-1 ring-slate-200">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-8 md:px-6">
          <Logo className="size-7 rounded-[8px]" />
          <p className="font-semibold">DoseCircle</p>
          <p className="text-[14px] text-slate-500 md:ml-auto">Reminders and family alerts only. DoseCircle does not give medical advice.</p>
        </div>
      </footer>
    </div>
  );
}

function Heading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-blue-700">{eyebrow}</p>
      <h2 className="font-display mt-3 text-[34px] leading-tight tracking-tight md:text-5xl">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-slate-600">{body}</p>}
    </div>
  );
}

function EntryLink({ to, icon: Icon, title, note, primary = false }: { to: string; icon: LucideIcon; title: string; note: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={cx(
        "pressable group flex min-h-[72px] items-center gap-4 rounded-2xl px-5 py-3",
        primary ? "bg-blue-600 text-white shadow-[0_14px_30px_-14px_rgb(37_99_235/0.8)] hover:bg-blue-700" : "bg-white text-ink ring-1 ring-slate-300 hover:ring-blue-300",
      )}
    >
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", primary ? "bg-white/15" : "bg-blue-50 text-blue-700")}>
        <Icon aria-hidden className="size-5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight">{title}</span>
        <span className={cx("mt-0.5 block text-[14px]", primary ? "text-blue-100" : "text-slate-500")}>{note}</span>
      </span>
      <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** A drawn QR mark, not a real code: a scannable code here would lead nowhere useful. */
function QrArt(): ReactNode {
  const cells = [
    "1110111", "1010101", "1110111", "0001000", "1101011", "0110110", "1011101",
  ];
  return (
    <div aria-hidden className="relative grid size-[84px] shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-[0_12px_28px_-12px_rgb(37_99_235/0.8)]">
      <div className="grid grid-cols-7 gap-[2px] rounded-lg bg-white p-1.5">
        {cells.join("").split("").map((cell, i) => (
          <span key={i} className={cx("size-[6px] rounded-[1.5px]", cell === "1" ? "bg-ink" : "bg-transparent")} />
        ))}
      </div>
      <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-white text-blue-700 shadow ring-1 ring-blue-100">
        <Camera className="size-3.5" strokeWidth={2.5} />
      </span>
    </div>
  );
}
