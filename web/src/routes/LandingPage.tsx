import { ArrowDown, ArrowRight, Camera, Check, Hand, KeyRound, Languages, ScanLine, Smartphone, UserPlus, Users, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { FamilyCircle, type CircleStage } from "../components/FamilyCircle";
import { Logo } from "../components/Logo";
import { QrScanner } from "../components/QrScanner";
import { applyTheme, initialTheme } from "../components/ThemeToggle";
import { DemoStory } from "../components/DemoStory";
import { cx } from "../components/ui";
import { pairedDevice } from "../lib/device";
import { isStandalone } from "../lib/push";

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
  // Apps installed before start_url moved to /app still open here; send them on too.
  if (isStandalone()) return <Navigate to="/app" replace />;
  return <Landing />;
}

function Landing() {
  useLightPage();
  const device = pairedDevice();
  const frame = useLoop();
  const [scanning, setScanning] = useState(false);
  const reduce = useReducedMotion();
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const } });

  const pillPrimary = "pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-indigo px-6 text-[15.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(31_63_55/0.7)] hover:bg-indigo-deep";
  const pillOutline = "pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-transparent px-6 text-[15.5px] font-semibold text-ink hover:border-indigo/40 hover:bg-surface";

  return (
    <div className="min-h-dvh overflow-x-clip bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-4 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="DoseCircle">
            <Logo className="size-8 rounded-[9px]" />
            <span className="font-display hidden text-[26px] text-indigo-deep min-[400px]:inline">DoseCircle</span>
          </Link>
          <nav className="ml-8 hidden items-center gap-8 text-[14px] text-muted md:flex">
            <button type="button" onClick={() => scrollTo("demo")} className="hover:text-indigo-soft">
              How it works
            </button>
            <button type="button" onClick={() => scrollTo("start")} className="hover:text-indigo-soft">
              For families
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {device && (
              <Link to="/parent" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-[14.5px] font-semibold text-muted hover:text-ink sm:inline-flex">
                <Smartphone aria-hidden className="size-4" /> My medicines
              </Link>
            )}
            <Link to="/signin" className="pressable inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-[14.5px] font-semibold hover:border-indigo/40">
              Log in
            </Link>
            <button type="button" onClick={() => scrollTo("start")} className="pressable inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-indigo px-4 text-[14.5px] font-semibold text-white hover:bg-indigo-deep">
              Get started
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* A large, soft sage disc behind the visual: the reference's one piece of decoration. */}
        <div aria-hidden className="pointer-events-none absolute -bottom-64 -right-44 size-[600px] rounded-full bg-indigo-tint/90" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:px-6 md:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pb-24">
          <div>
            <motion.p {...rise(0)} className="eyebrow">
              Medicine reminders for the people you care
            </motion.p>
            <motion.h1 {...rise(0.05)} className="font-display mt-6 text-[46px] leading-[1.02] text-[#173432] sm:text-[62px] xl:text-[76px] dark:text-ink">
              When they forget, <span className="italic text-indigo">you’re still there.</span>
            </motion.h1>
            <motion.p {...rise(0.12)} className="mt-6 max-w-lg text-[17px] leading-[1.7] text-muted">
              A gentle reminder for them. A little peace of mind for you. If they miss their medicine, DoseCircle makes sure someone who cares knows.
            </motion.p>
            <motion.div {...rise(0.18)} className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signin?mode=create" className={pillPrimary}>
                Set up your circle <ArrowRight aria-hidden className="size-4.5" />
              </Link>
              <button type="button" onClick={() => scrollTo("demo")} className={pillOutline}>
                See how it works <ArrowDown aria-hidden className="size-4.5" />
              </button>
            </motion.div>
            <motion.ul {...rise(0.24)} className="mt-12 flex flex-wrap gap-x-8 gap-y-4">
              {[
                { icon: Languages, text: <>Reminders in <span lang="kn">ಕನ್ನಡ</span>, <span lang="hi">हिन्दी</span>, English</> },
                { icon: Users, text: "One person asked at a time" },
                { icon: Hand, text: "One tap to take it on" },
              ].map(({ icon: Icon, text }, index) => (
                <li key={index} className="flex items-center gap-2.5 text-[13.5px] text-muted">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-tint text-indigo-soft">
                    <Icon aria-hidden className="size-4" strokeWidth={2.25} />
                  </span>
                  {text}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* The reference's arched panel, holding the live diagram, with a card floating over it. */}
          <motion.div {...rise(0.1)} className="relative">
            <div className="relative overflow-hidden rounded-t-[220px] rounded-b-[26px] bg-[#dce4d8] bg-[image:linear-gradient(145deg,rgb(255_255_255/0.35),transparent)] px-4 pb-24 pt-24 sm:px-8 lg:ml-auto lg:w-[92%] dark:bg-indigo-tint dark:bg-none">
              <p className="font-display absolute inset-x-0 top-12 hidden whitespace-nowrap text-center text-[18px] italic leading-snug text-indigo-deep sm:block dark:text-ink">
                Mysuru · Bengaluru · Pune
              </p>
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
              <motion.p key={frame.stage} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="min-h-7 px-1 text-center text-[15px] font-medium text-indigo-deep dark:text-ink">
                {CAPTIONS[frame.stage]}
              </motion.p>
            </div>
            <div className="float-card relative -mt-16 ml-4 w-[270px] bg-surface/95 p-6 backdrop-blur-sm lg:ml-0">
              <p className="font-display text-[21px] leading-snug">
                Don't just remind.
                <br />
                Make sure.
              </p>
              <ul className="mt-4 space-y-3">
                {["A reminder in her language", "The family asked, one at a time", "One tap to take it on"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-[13.5px] text-muted">
                    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-taken-tint text-taken">
                      <Check aria-hidden className="size-3" strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Get started */}
      <section id="start" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-24">
          <div className="flex items-end justify-between gap-10">
            <Heading eyebrow="Get started" title="Two ways in, depending on who you are" body="Nobody who takes the medicines ever needs an account. The family sets things up; the person they look after just scans a code." />
            <img
              src="/photos/grandmother-phone.webp"
              width={421}
              height={408}
              loading="lazy"
              alt="A grandmother smiles at her phone while her daughter leans in. Handwritten: Technology that feels like family."
              className="hidden w-[260px] shrink-0 rotate-2 rounded-[22px] shadow-[0_24px_48px_-24px_rgb(23_63_55/0.45)] ring-8 ring-white lg:block"
            />
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* The person taking the medicines never makes an account. The app scans the family's
                code itself, so it opens in the installed app rather than the browser. */}
            <article className="sticker relative overflow-hidden bg-surface p-7 md:p-9">
              <div className="flex items-start gap-5">
                <QrArt />
                <div className="min-w-0">
                  <p className="eyebrow">If you take the medicines</p>
                  <h3 className="font-display mt-2 text-[26px] leading-tight">Scan to join your family</h3>
                </div>
              </div>
              <ol className="mt-7 space-y-3.5">
                {[
                  "Tap “Scan the code now” and point the camera at the code your family shows you.",
                  "DoseCircle reads it and connects this phone. There is nothing to type.",
                  "That's all. No account, no password, nothing to set up — your family has done it.",
                ].map((text, index) => (
                  <li key={text} className="flex items-start gap-3.5">
                    <span className="font-serif-num grid size-8 shrink-0 place-items-center rounded-full bg-indigo-tint text-[15px] text-indigo-soft">{index + 1}</span>
                    <p className="pt-1 text-[15.5px] leading-relaxed text-ink">{text}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setScanning(true)} className={pillPrimary}>
                  <ScanLine aria-hidden className="size-4.5" /> Scan the code now
                </button>
                <Link to="/join" className={pillOutline}>
                  Type a code instead
                </Link>
              </div>
              {scanning && <QrScanner lang="en" onClose={() => setScanning(false)} />}
            </article>

            <article className="sticker flex flex-col bg-surface p-7 md:p-9">
              <span className="grid size-12 place-items-center rounded-full bg-indigo-tint text-indigo-soft">
                <Users aria-hidden className="size-5" strokeWidth={2.25} />
              </span>
              <p className="eyebrow mt-6">If you look after someone</p>
              <h3 className="font-display mt-2 text-[26px] leading-tight">Set up your family</h3>
              <p className="mt-3 text-[15.5px] leading-[1.7] text-muted">
                Add the person you care for and their medicines, then invite the rest of the family. Everyone is alerted in the order you choose.
              </p>
              <div className="mt-auto grid gap-3 pt-8">
                <EntryLink to="/signin?mode=create" icon={UserPlus} primary title="Create a family account" note="Email and password · about two minutes" />
                <EntryLink to="/signin" icon={KeyRound} title="Log in" note="Already set up? Welcome back." />
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Demo — heading and walkthrough fit one screen together, so nobody scrolls to follow it. */}
      <section id="demo" className="scroll-mt-16 border-t border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:flex-col lg:justify-center lg:py-6">
          <DemoStory
            header={
              <div>
                <p className="eyebrow">How it works</p>
                <h2 className="font-display mt-2 text-[32px] leading-tight md:text-[40px]">One missed dose, start to finish</h2>
                <p className="mt-2 text-[15.5px] text-muted">Amma reads Kannada, Arjun English, Meera Hindi. The app's real screens, with an invented family.</p>
              </div>
            }
          />
        </div>
      </section>

      {/* The reference's closing block: deep green, one line, one button. */}
      <section className="px-4 pb-16 pt-6 md:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-indigo px-7 py-12 text-white md:px-14 md:py-16">
          <span aria-hidden className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full border-[48px] border-white/[0.04]" />
          <img
            src="/photos/hug-station.webp"
            width={420}
            height={408}
            loading="lazy"
            alt="A mother hugs her grown son on a railway platform. Handwritten: For the people who are always there for us."
            className="absolute right-14 top-1/2 hidden w-[280px] -translate-y-1/2 -rotate-2 rounded-[22px] shadow-[0_28px_56px_-20px_rgb(0_0_0/0.5)] ring-8 ring-white/10 lg:block"
          />
          <h2 className="font-display relative max-w-xl text-[34px] leading-[1.08] md:text-[48px]">Small steps make a big difference.</h2>
          <p className="relative mt-4 max-w-md text-[16px] leading-relaxed text-white/75">Set up your family in two minutes. The person you look after only ever scans a code.</p>
          <Link to="/signin?mode=create" className="pressable relative mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-[15.5px] font-semibold text-indigo hover:bg-indigo-tint">
            Create a family account <ArrowRight aria-hidden className="size-4.5" />
          </Link>
        </div>
      </section>

      {/* A single line of the architecture — the walkthrough shows what each part does. */}
      <section className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-9 md:flex-row md:items-center md:px-6">
          <p className="eyebrow shrink-0 !text-muted">Built on AWS · Mumbai</p>
          <ul className="flex flex-wrap gap-2">
            {AWS.map((name) => (
              <li key={name} className="rounded-full bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink ring-1 ring-line">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-8 md:px-6">
          <Logo className="size-7 rounded-[8px]" />
          <p className="font-display text-[20px] text-indigo-deep dark:text-ink">DoseCircle</p>
          <p className="text-[14px] text-muted md:ml-auto">Reminders and family alerts only. DoseCircle does not give medical advice.</p>
        </div>
      </footer>
    </div>
  );
}

function Heading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display mt-4 text-[36px] leading-[1.05] md:text-[48px]">{title}</h2>
      {body && <p className="mt-4 text-[16.5px] leading-[1.7] text-muted">{body}</p>}
    </div>
  );
}

function EntryLink({ to, icon: Icon, title, note, primary = false }: { to: string; icon: LucideIcon; title: string; note: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={cx(
        "pressable group flex min-h-[72px] items-center gap-4 rounded-2xl px-5 py-3",
        primary ? "bg-indigo text-white shadow-[0_14px_30px_-14px_rgb(31_63_55/0.7)] hover:bg-indigo-deep" : "bg-surface text-ink ring-1 ring-line-strong hover:ring-indigo/40",
      )}
    >
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", primary ? "bg-white/15" : "bg-indigo-tint text-indigo-soft")}>
        <Icon aria-hidden className="size-5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight">{title}</span>
        <span className={cx("mt-0.5 block text-[14px]", primary ? "text-hero-muted" : "text-muted")}>{note}</span>
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
    <div aria-hidden className="relative grid size-[84px] shrink-0 place-items-center rounded-full bg-indigo-tint">
      <div className="grid grid-cols-7 gap-[2px] rounded-lg bg-surface p-1.5 ring-1 ring-line">
        {cells.join("").split("").map((cell, i) => (
          <span key={i} className={cx("size-[6px] rounded-[1.5px]", cell === "1" ? "bg-ink" : "bg-transparent")} />
        ))}
      </div>
      <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-white text-indigo-soft shadow ring-1 ring-indigo-tint">
        <Camera className="size-3.5" strokeWidth={2.5} />
      </span>
    </div>
  );
}
