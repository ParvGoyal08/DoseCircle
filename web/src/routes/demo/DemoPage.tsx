import type { LanguageCode } from "@dosecircle/shared";
import { LANGUAGES } from "@dosecircle/shared";
import { ArrowRight, BarChart3, BellRing, Camera, HeartPulse, Loader2, Play, RotateCcw, Smartphone, WifiOff, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { FamilyAlert } from "../../components/FamilyAlert";
import { FamilyCircle, type CircleStage } from "../../components/FamilyCircle";
import { InsightsGrid, InsightsHero } from "../../components/InsightsDashboard";
import { Logo } from "../../components/Logo";
import { ParentDoseScreen } from "../../components/ParentDoseScreen";
import { NotificationBanner, PhoneFrame, type BannerNotification } from "../../components/PhoneFrame";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Timeline } from "../../components/Timeline";
import { Avatar, Button, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { demoClient } from "../../lib/demo";
import type { DemoSession, DemoState, InboxItem, Insights, OpenAlert, Timeline as TimelineData } from "../../lib/types";
import { useApi } from "../../lib/useApi";

const POLL_MS = 1500;

function usePolling(callback: () => Promise<void>, active: boolean, interval = POLL_MS) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        await saved.current();
      } catch {
        // A missed poll is retried on the next tick.
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? interval * 4 : interval);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, interval]);
}

const endonym = (code: LanguageCode) => LANGUAGES.find((l) => l.code === code)?.endonym ?? code;

function stageFor(state: DemoState | null, timeline: TimelineData | null): CircleStage {
  const dose = state?.currentDose;
  if (!dose) return "idle";
  const kinds = new Set((timeline?.items ?? []).map((i) => i.kind));
  switch (dose.status) {
    case "TAKEN":
      return "taken";
    case "TAKEN_LATE":
      return "late";
    case "CLAIMED":
      return "claimed";
    case "UNRESOLVED":
      return "unresolved";
    case "ESCALATING":
      return kinds.has("family_alerted") ? "everyone" : kinds.has("member_alerted") ? "alerting" : "checking";
    default:
      return kinds.has("no_confirmation") ? "checking" : "reminding";
  }
}

const STAGE_CAPTION: Record<CircleStage, string> = {
  idle: "Send a dose to start. Everything runs on the real workflow at 60× speed.",
  reminding: "A reminder is ringing on Shantha's phone. If she taps, nobody else is disturbed.",
  checking: "No tap yet. DoseCircle checks whether the reminder reached her phone.",
  alerting: "Missed. The family is asked one person at a time, in the order they chose.",
  everyone: "Nobody claimed it in time, so the whole family has been alerted.",
  claimed: "Someone took responsibility. Everyone else was told to stand down.",
  taken: "Taken on time. Nobody was disturbed.",
  late: "Taken late. Everyone who was alerted has been told.",
  unresolved: "Nobody responded. The dose is marked unresolved for the doctor report.",
};

export function DemoPage() {
  const client = demoClient();
  const [session, setSession] = useState<DemoSession | null>(() => client.session());
  const [state, setState] = useState<DemoState | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [critical, setCritical] = useState(false);
  const [parentOffline, setParentOffline] = useState(false);
  const [busy, setBusy] = useState<null | "start" | "send" | "reset">(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"live" | "dashboard">("live");

  const start = async () => {
    setBusy("start");
    setError(null);
    try {
      setSession(await client.start());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  usePolling(
    async () => {
      const next = await client.state();
      setState(next);
      if (next.currentDose) setTimeline(await client.timeline(next.currentDose.doseId, next.members[0]!.mid));
    },
    Boolean(session),
  );

  const running = state?.executionStatus === "RUNNING";

  const sendDose = async () => {
    setBusy("send");
    setError(null);
    try {
      await client.sendDose({ critical });
      setTimeline(null);
      setState(await client.state());
      setView("live");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      await client.reset();
    } finally {
      setSession(null);
      setState(null);
      setTimeline(null);
      setParentOffline(false);
      setBusy(null);
    }
  };

  const stage = useMemo(() => stageFor(state, timeline), [state, timeline]);
  const members = session?.members ?? [];
  const alertedIds = useMemo(() => {
    const names = (timeline?.items ?? []).filter((i) => i.kind === "member_alerted").flatMap((i) => i.people ?? []);
    return members.filter((m) => names.includes(m.displayName)).map((m) => m.mid);
  }, [timeline, members]);
  const dose = state?.currentDose ?? null;

  if (!session) return <DemoIntro onStart={start} busy={busy === "start"} error={error} simulated={client.simulated} />;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="hero-surface relative">
        <div aria-hidden className="hero-grid absolute inset-0" />
        <div className="relative mx-auto max-w-[1440px] px-4 pb-6 pt-4 md:px-8">
          <nav className="flex flex-wrap items-center gap-2">
            <Link to="/" className="mr-2 flex items-center gap-2.5">
              <Logo className="size-9 rounded-[10px] ring-1 ring-white/20" />
              <span className="text-lg font-semibold tracking-tight text-white">DoseCircle</span>
            </Link>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-hero-muted ring-1 ring-white/15">Demo · fictional family</span>
            {client.simulated && <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-hero-muted ring-1 ring-white/15">Offline simulation</span>}
            <div role="tablist" className="ml-auto flex rounded-full bg-white/10 p-1 ring-1 ring-white/15">
              {[
                { id: "live" as const, label: "Live escalation", icon: Zap },
                { id: "dashboard" as const, label: "Family dashboard", icon: BarChart3 },
              ].map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)} className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors", view === tab.id ? "bg-haldi text-[#14133a]" : "text-white hover:bg-white/10")}>
                  <tab.icon aria-hidden className="size-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            <Link to="/demo/prescription" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">
              <Camera className="size-4" aria-hidden />
              Prescription photo
            </Link>
            <ThemeToggle className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10" />
          </nav>

          {view === "live" && (
            <div className="mt-6 grid items-center gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-haldi">Mysuru · Bengaluru · Pune</p>
                <h1 className="font-display mt-2 text-5xl text-white md:text-6xl">Shantha's family circle</h1>
                <AnimatePresence mode="wait">
                  <motion.p key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4 min-h-14 max-w-xl text-lg text-hero-muted" role="status">
                    {STAGE_CAPTION[stage]}
                  </motion.p>
                </AnimatePresence>
                <section aria-label="Demo controls" className="mt-5 flex flex-wrap items-center gap-2.5">
                  <Button tone="haldi" size="lg" onClick={sendDose} disabled={running || busy !== null}>
                    {busy === "send" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" aria-hidden />}
                    Send a dose now
                  </Button>
                  <Toggle checked={critical} onChange={setCritical} disabled={running} icon={HeartPulse} label="Important medicine" />
                  <Toggle checked={parentOffline} onChange={setParentOffline} icon={WifiOff} label="Amma's phone offline" />
                  <button type="button" onClick={reset} disabled={busy !== null} aria-label="Reset demo" className="grid size-12 place-items-center rounded-xl text-white ring-1 ring-white/25 hover:bg-white/10 disabled:opacity-50">
                    <RotateCcw className="size-4.5" aria-hidden />
                  </button>
                </section>
                <p className="mt-3 flex items-center gap-1.5 text-[13px] text-hero-muted">
                  <Zap aria-hidden className="size-3.5 text-haldi" /> 60× speed: 20 minutes take 20 seconds
                </p>
                {error && (
                  <p role="alert" className="mt-4 rounded-xl bg-[#ff8a80]/15 px-4 py-2 font-medium text-[#ff8a80] ring-1 ring-[#ff8a80]/30">
                    {error}
                  </p>
                )}
              </div>
              <div className="glass-card p-3 md:p-5">
                <FamilyCircle
                  parent={{ id: session.parent.pid, name: session.parent.displayName, role: "Amma · Mysuru" }}
                  members={members.map((m) => ({ id: m.mid, name: m.displayName, role: m.relation }))}
                  stage={stage}
                  alertedIds={alertedIds}
                  claimedById={dose?.claimedBy ?? null}
                  parentOffline={parentOffline}
                  missClass={dose?.missClass ?? null}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {view === "dashboard" ? (
        <DemoDashboard session={session} lastReceiptAt={state?.parent?.lastReceiptAt ?? null} />
      ) : (
        <main className="mx-auto grid max-w-[1440px] gap-6 px-4 pb-20 pt-8 md:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-label="Phones">
            <div className="grid gap-x-6 gap-y-10 md:grid-cols-3">
              <PhoneColumn name={session.parent.displayName} role="Mother" city={session.parent.city} lang={session.parent.lang}>
                <ParentPane session={session} state={state} offline={parentOffline} />
              </PhoneColumn>
              {members.map((member) => (
                <PhoneColumn key={member.mid} name={member.displayName} role={member.relation} city={member.city} lang={member.lang}>
                  <FamilyPane session={session} memberId={member.mid} state={state} timeline={timeline} />
                </PhoneColumn>
              ))}
            </div>
          </section>

          <aside className="sticker flex max-h-[820px] flex-col self-start overflow-hidden bg-surface xl:sticky xl:top-4">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold">Behind the scenes</h2>
              <p className="mt-0.5 text-[13.5px] text-muted">Each step shows the Step Functions state that ran it, and the Cedar policy that allowed each action.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5">
              {timeline && timeline.items.length > 0 ? <Timeline items={timeline.items} lang="en" live={running} /> : <p className="pb-5 text-[15px] text-muted">The workflow's steps appear here as they happen.</p>}
            </div>
            <ArchitectureStrip />
          </aside>
        </main>
      )}
    </div>
  );
}

function DemoDashboard({ session, lastReceiptAt }: { session: DemoSession; lastReceiptAt: string | null }) {
  const client = demoClient();
  const [days, setDays] = useState<7 | 30>(30);
  const insights = useApi<Insights>(() => client.insights(days), [days]);
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 pb-20 pt-8 md:px-8">
      {insights.data ? (
        <>
          <InsightsHero parentName={session.parent.displayName} lastReceiptAt={lastReceiptAt} insights={insights.data} days={days} onDays={setDays} lang="en" />
          <InsightsGrid insights={insights.data} lang="en" />
        </>
      ) : (
        <div className="hero-surface h-80 animate-pulse rounded-[24px]" />
      )}
    </main>
  );
}

function PhoneColumn({ name, role, city, lang, children }: { name: string; role: string; city: string; lang: LanguageCode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2.5">
        <Avatar name={name} size={36} />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold">
            {name} <span className="font-normal text-muted">· {role}</span>
          </p>
          <p className="text-[13px] text-muted">
            {city} · <span lang={lang} className="font-semibold text-ink">{endonym(lang)}</span>
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, icon: Icon, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; icon: typeof HeartPulse; label: string }) {
  return (
    <label className={cx("inline-flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl px-3 ring-1 transition-colors", checked ? "bg-white/15 ring-haldi/60" : "ring-white/25 hover:bg-white/10", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={cx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-haldi" : "bg-white/25")}>
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      <Icon aria-hidden className="size-4 text-white" />
      <span className="text-[14.5px] font-semibold text-white">{label}</span>
    </label>
  );
}

function ArchitectureStrip() {
  const steps = ["EventBridge Scheduler", "Step Functions", "Lambda", "DynamoDB", "Verified Permissions", "Web Push"];
  return (
    <div className="hero-surface px-5 py-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-haldi">Running on AWS · Mumbai</p>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-white">
        {steps.map((step, index) => (
          <span key={step} className="inline-flex items-center gap-1.5">
            {index > 0 && <ArrowRight aria-hidden className="size-3 text-hero-muted" />}
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 ring-1 ring-white/15">{step}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/** Tracks which inbox items a pane has already shown, and shows new ones as notifications. */
function useInbox(items: InboxItem[] | undefined, recipient: string, online: boolean, onArrive: (item: InboxItem) => void) {
  const seen = useRef(new Set<string>());
  const [banner, setBanner] = useState<(BannerNotification & { item: InboxItem }) | null>(null);
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  useEffect(() => {
    if (!online || !items) return;
    const fresh = items.filter((item) => !seen.current.has(`${item.at}|${item.step}`));
    if (fresh.length === 0) return;
    for (const item of fresh) {
      seen.current.add(`${item.at}|${item.step}`);
      arrive.current(item);
    }
    const latest = fresh[fresh.length - 1]!;
    setBanner({ id: `${recipient}-${latest.at}`, title: latest.title, body: latest.body, lang: latest.lang, nowLabel: "", item: latest });
  }, [items, online, recipient]);

  const dismiss = useCallback(() => setBanner(null), []);
  return { banner, dismiss };
}

function ParentPane({ session, state, offline }: { session: DemoSession; state: DemoState | null; offline: boolean }) {
  const client = demoClient();
  const { t, lang } = useT(session.parent.lang);
  const recipient = `parent-${session.parent.pid}`;
  const [open, setOpen] = useState(false);
  const dose = state?.currentDose ?? null;
  const doseId = dose?.doseId;

  useEffect(() => setOpen(false), [doseId]);

  const { banner, dismiss } = useInbox(state?.inbox[recipient], recipient, !offline, (item) => {
    // A real phone's service worker posts this receipt the instant the push arrives.
    void client.receipt(item, recipient);
  });

  const onTaken = useCallback(
    async ({ keepalive }: { keepalive: boolean }) => {
      if (doseId) await client.taken(doseId, { keepalive });
    },
    [client, doseId],
  );

  return (
    <PhoneFrame offline={offline}>
      <NotificationBanner
        notification={banner && { ...banner, nowLabel: t("common.now") }}
        onOpen={() => {
          setOpen(true);
          dismiss();
        }}
        onDismiss={dismiss}
      />
      {offline && (
        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-xl bg-offline px-3 py-2 text-[13px] font-semibold text-white">
          <WifiOff className="size-4 shrink-0" aria-hidden strokeWidth={2.5} /> Airplane mode: reminders wait until the phone is back online
        </div>
      )}
      {dose && open ? (
        <ParentDoseScreen key={dose.doseId} dose={dose} onTaken={onTaken} framed />
      ) : (
        <div className="flex h-full flex-col px-5 pt-4">
          <h2 lang={lang} className="text-[26px] font-semibold tracking-tight">
            {t("parent.today.title")}
          </h2>
          {dose ? (
            <button type="button" onClick={() => setOpen(true)} className="pressable mt-4 flex items-center gap-3 rounded-2xl bg-haldi p-4 text-left text-[#14133a]">
              <BellRing className="size-8 text-due" aria-hidden strokeWidth={2.5} />
              <span className="min-w-0 flex-1">
                <span lang={lang} className="block text-xl font-semibold">
                  {t(`slot.${dose.slotName}`)}
                </span>
                <span lang={lang} className="block text-[16px] font-medium">
                  {dose.status === "TAKEN" || dose.status === "TAKEN_LATE" ? t("parent.status.taken") : dose.status === "CLAIMED" ? t("parent.status.familyHelping") : t("parent.status.waiting")}
                </span>
              </span>
              <ArrowRight className="size-6" aria-hidden strokeWidth={2.5} />
            </button>
          ) : (
            <div className="mt-6 flex flex-col items-center text-center">
              <span className="grid size-20 place-items-center rounded-full bg-taken-tint text-taken">
                <BellRing aria-hidden className="size-9" />
              </span>
              <p lang={lang} className="mt-4 text-xl font-medium text-muted">
                {t("parent.today.none")}
              </p>
            </div>
          )}
          <p className="mt-auto flex items-center gap-2 pb-6 text-[13px] font-medium text-muted">
            <Smartphone className="size-4" aria-hidden /> Tap a notification to open it
          </p>
        </div>
      )}
    </PhoneFrame>
  );
}

function FamilyPane({ session, memberId, state, timeline }: { session: DemoSession; memberId: string; state: DemoState | null; timeline: TimelineData | null }) {
  const client = demoClient();
  const member = session.members.find((m) => m.mid === memberId)!;
  const { t, lang } = useT(member.lang);
  const [why, setWhy] = useState(false);
  const [lastAlert, setLastAlert] = useState<OpenAlert | null>(null);

  const { banner, dismiss } = useInbox(state?.inbox[memberId], memberId, true, (item) => void client.receipt(item, memberId));

  const dose = state?.currentDose ?? null;
  const open = state?.openAlertsByMember[memberId]?.[0] ?? null;
  const receivedAlert = Boolean(dose && state?.inbox[memberId]?.some((i) => i.doseId === dose.doseId && (i.step === "ALERT" || i.step === "BROADCAST")));

  // Keep the card on screen after the dose resolves, updated with how it ended.
  useEffect(() => {
    if (open) setLastAlert(open);
    else if (!dose) setLastAlert(null);
    else if (lastAlert && lastAlert.doseId === dose.doseId && lastAlert.status !== dose.status) setLastAlert({ ...lastAlert, status: dose.status, claimedByName: dose.claimedByName });
    else if (lastAlert && lastAlert.doseId !== dose.doseId) setLastAlert(null);
  }, [open, dose, lastAlert]);

  const alert = open ?? (receivedAlert ? lastAlert : null);
  const ladder = (state?.members ?? []).slice().sort((a, b) => a.position - b.position);

  return (
    <PhoneFrame>
      <NotificationBanner notification={banner && { ...banner, nowLabel: t("common.now") }} onOpen={dismiss} onDismiss={dismiss} />
      <div className="h-full overflow-y-auto px-4 pb-6 pt-3">
        <div className="flex items-center gap-2">
          <Logo className="size-7" />
          <span className="text-[16px] font-semibold">DoseCircle</span>
        </div>
        {alert ? (
          <div className="mt-4">
            <FamilyAlert
              alert={alert}
              viewerLang={member.lang}
              viewerMid={memberId}
              ladder={ladder}
              alertedCount={alert.alertedCount}
              onClaim={() => client.claim(alert.doseId, memberId)}
              onWhy={() => setWhy(true)}
            />
          </div>
        ) : (
          <div className="sticker mt-4 bg-surface p-4">
            <div className="flex items-center gap-3">
              <Avatar name={session.parent.displayName} size={48} />
              <div>
                <p className="text-xl font-semibold">{session.parent.displayName}</p>
                <p lang={lang} className="text-[15px] font-medium">
                  {dose ? t(`status.${dose.status === "TAKEN" ? "taken" : dose.status === "TAKEN_LATE" ? "takenLate" : dose.status === "PENDING" ? "pending" : dose.status === "CLAIMED" ? "claimed" : dose.status === "UNRESOLVED" ? "unresolved" : "escalating"}`) : t("parent.today.none")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {why && timeline && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-[26px] border-t border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 lang={lang} className="text-lg font-semibold">
                {t("timeline.title")}
              </h3>
              <button type="button" onClick={() => setWhy(false)} className="min-h-10 rounded-full bg-surface px-3 text-[15px] font-semibold ring-1 ring-line-strong">
                <span lang={lang}>{t("common.close")}</span>
              </button>
            </div>
            <div className="overflow-y-auto px-4 pt-4">
              <Timeline items={timeline.items} lang={member.lang} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneFrame>
  );
}

function DemoIntro({ onStart, busy, error, simulated }: { onStart: () => void; busy: boolean; error: string | null; simulated: boolean }) {
  const people: { name: string; role: string; city: string; lang: LanguageCode; note: string }[] = [
    { name: "Shantha", role: "Amma", city: "Mysuru", lang: "kn", note: "Diabetes and blood-pressure tablets, insulin at night." },
    { name: "Arjun", role: "Son", city: "Bengaluru", lang: "en", note: "First in the family order." },
    { name: "Meera", role: "Daughter", city: "Pune", lang: "hi", note: "Second in the family order." },
  ];
  return (
    <div className="hero-surface relative min-h-dvh">
      <div aria-hidden className="hero-grid absolute inset-0" />
      <main className="relative mx-auto flex max-w-5xl flex-col px-4 py-8 md:py-12">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="size-10 rounded-[10px] ring-1 ring-white/20" />
          <span className="text-xl font-semibold tracking-tight text-white">DoseCircle</span>
        </Link>
        <p className="mt-14 text-[13px] font-semibold uppercase tracking-[0.16em] text-haldi">Live demo</p>
        <h1 className="font-display mt-3 max-w-4xl text-5xl text-white md:text-7xl">Watch a missed dose travel through a family.</h1>
        <p className="mt-6 max-w-2xl text-lg text-hero-muted md:text-xl">
          Three phones side by side, each in its owner's language. Send a dose, let it go unanswered, and watch the right person get alerted, claim it, and everyone else stand down. Same AWS workflow as real families, at 60× speed.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {people.map((person) => (
            <li key={person.name} className="glass-card p-5">
              <div className="flex items-center gap-3">
                <Avatar name={person.name} size={44} className="!bg-white/12 !text-white ring-1 ring-white/25" />
                <div className="leading-tight">
                  <p className="text-lg font-semibold text-white">{person.name}</p>
                  <p className="text-[14px] text-hero-muted">
                    {person.role} · {person.city}
                  </p>
                </div>
              </div>
              <p className="mt-4 inline-flex rounded-full bg-haldi px-3 py-0.5 text-[15px] font-semibold text-[#14133a]" lang={person.lang}>
                {endonym(person.lang)}
              </p>
              <p className="mt-3 text-[14.5px] text-hero-muted">{person.note}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Button tone="haldi" size="lg" onClick={onStart} disabled={busy} className="min-h-14 px-7 text-lg">
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" aria-hidden />}
            Start the demo
          </Button>
          <p className="max-w-sm text-[14.5px] text-hero-muted">{simulated ? "Offline simulation: no API is configured." : "Creates a private fictional family that deletes itself after 2 hours."}</p>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-[#ff8a80]/15 px-4 py-3 font-medium text-[#ff8a80] ring-1 ring-[#ff8a80]/30">
            {error}
          </p>
        )}
        <p className="mt-12 text-[13.5px] text-hero-muted">All names are fictional. Reminders and family alerts only; this is not medical advice. Best viewed on a laptop.</p>
      </main>
    </div>
  );
}
