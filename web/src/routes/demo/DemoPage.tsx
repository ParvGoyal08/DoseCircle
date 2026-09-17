import type { LanguageCode } from "@dosecircle/shared";
import { LANGUAGES } from "@dosecircle/shared";
import { ArrowRight, BellRing, FileText, HeartPulse, Loader2, Play, RotateCcw, Smartphone, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { FamilyAlert } from "../../components/FamilyAlert";
import { Logo } from "../../components/Logo";
import { ParentDoseScreen } from "../../components/ParentDoseScreen";
import { NotificationBanner, PhoneFrame, type BannerNotification } from "../../components/PhoneFrame";
import { Timeline } from "../../components/Timeline";
import { Avatar, Button, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { demoClient } from "../../lib/demo";
import type { DemoSession, DemoState, InboxItem, OpenAlert, Timeline as TimelineData } from "../../lib/types";

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

type Stage = { key: string; label: string };

/** Where the escalation has reached, from the timeline the backend builds out of Step Functions history. */
function stagesFor(state: DemoState | null, timeline: TimelineData | null): { stages: Stage[]; reached: number; outcome: "taken" | "late" | "claimed" | "unresolved" | null } {
  const members = state?.members ?? [];
  const stages: Stage[] = [
    { key: "remind", label: "Reminder" },
    { key: "check", label: "Missed or offline?" },
    ...members.map((m) => ({ key: `alert-${m.mid}`, label: `Ask ${m.displayName}` })),
    { key: "everyone", label: "Everyone" },
  ];
  const items = timeline?.items ?? [];
  let reached = items.length ? 0 : -1;
  if (items.some((i) => i.kind === "reminder_reached_phone" || i.kind === "phone_seemed_offline")) reached = 1;
  const alertedNames = items.filter((i) => i.kind === "member_alerted").flatMap((i) => i.people ?? []);
  members.forEach((m, index) => {
    if (alertedNames.includes(m.displayName)) reached = 2 + index;
  });
  if (items.some((i) => i.kind === "family_alerted")) reached = stages.length - 1;
  const status = state?.currentDose?.status;
  const outcome = status === "TAKEN" ? "taken" : status === "TAKEN_LATE" ? "late" : status === "CLAIMED" ? "claimed" : status === "UNRESOLVED" ? "unresolved" : null;
  return { stages, reached, outcome };
}

export function DemoPage() {
  const client = demoClient();
  const [session, setSession] = useState<DemoSession | null>(() => client.session());
  const [state, setState] = useState<DemoState | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [critical, setCritical] = useState(false);
  const [parentOffline, setParentOffline] = useState(false);
  const [busy, setBusy] = useState<null | "start" | "send" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

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

  const progress = useMemo(() => stagesFor(state, timeline), [state, timeline]);

  if (!session) return <DemoIntro onStart={start} busy={busy === "start"} error={error} simulated={client.simulated} />;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface/70">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-8" />
            <span className="text-lg font-semibold tracking-tight">DoseCircle</span>
          </Link>
          <span className="rounded-full bg-haldi-tint px-3 py-1 text-[13px] font-semibold text-haldi-deep">Live demo · fictional family</span>
          {client.simulated && <span className="rounded-full bg-offline-tint px-3 py-1 text-[13px] font-semibold text-offline">Offline simulation (no API configured)</span>}
          <nav className="ml-auto flex items-center gap-2">
            <Link to="/demo/prescription" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-ink hover:bg-paper">
              <FileText className="size-4" strokeWidth={2.25} aria-hidden />
              Prescription photo
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-5 md:px-8">
        <section aria-label="Demo controls" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="ink" size="lg" onClick={sendDose} disabled={running || busy !== null}>
              {busy === "send" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" strokeWidth={2.5} aria-hidden />}
              Send a dose now
            </Button>
            <Toggle checked={critical} onChange={setCritical} disabled={running} icon={HeartPulse} label="Important medicine" hint="Faster family alerts" />
            <Toggle checked={parentOffline} onChange={setParentOffline} icon={WifiOff} label="Mother's phone offline" hint="No delivery receipt" />
          </div>
          <div className="flex items-center gap-3 lg:ml-auto">
            <p className="text-[14px] text-muted">
              <span className="font-semibold text-ink">60× speed</span> · 20 minutes take 20 seconds
            </p>
            <Button tone="quiet" size="md" onClick={reset} disabled={busy !== null}>
              <RotateCcw className="size-4" strokeWidth={2.5} aria-hidden />
              Reset
            </Button>
          </div>
        </section>

        {error && (
          <p role="alert" className="mt-3 rounded-[var(--radius-card)] bg-missed-tint px-4 py-3 text-[15px] font-medium text-missed">
            {error}
          </p>
        )}

        <EscalationTrack {...progress} running={running} />

        <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-3">
            <ParentPane session={session} state={state} offline={parentOffline} />
            {session.members.map((member) => (
              <FamilyPane key={member.mid} session={session} memberId={member.mid} state={state} timeline={timeline} />
            ))}
          </div>

          <aside className="self-start rounded-[var(--radius-card)] border border-line bg-surface xl:sticky xl:top-4">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold">Behind the scenes</h2>
              <p className="mt-0.5 text-[14px] text-muted">Each step names the Step Functions state that ran it, and the Cedar policy that allowed each action.</p>
            </div>
            <div className="max-h-[640px] overflow-y-auto px-5 pt-5">
              {timeline && timeline.items.length > 0 ? (
                <Timeline items={timeline.items} lang="en" live={running} />
              ) : (
                <p className="pb-5 text-[15px] text-muted">Send a dose to watch the workflow run.</p>
              )}
            </div>
            <ArchitectureStrip />
          </aside>
        </div>
      </main>
    </div>
  );
}

function Toggle({ checked, onChange, disabled, icon: Icon, label, hint }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; icon: typeof HeartPulse; label: string; hint: string }) {
  return (
    <label className={cx("inline-flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-button)] border px-3 py-1.5", checked ? "border-ink bg-paper" : "border-line", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={cx("relative h-6 w-10 rounded-full transition-colors", checked ? "bg-ink" : "bg-line-strong")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      <Icon aria-hidden className="size-4.5 text-muted" strokeWidth={2.25} />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[12.5px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

function EscalationTrack({ stages, reached, outcome, running }: ReturnType<typeof stagesFor> & { running: boolean }) {
  const outcomeText = {
    taken: { text: "Taken on time. Nobody was disturbed.", className: "bg-taken-tint text-taken" },
    late: { text: "Taken late. Everyone alerted was told.", className: "bg-taken-tint text-taken" },
    claimed: { text: "Claimed. Everyone else stood down.", className: "bg-claimed-tint text-claimed" },
    unresolved: { text: "Nobody responded. Marked unresolved.", className: "bg-missed-tint text-missed" },
  } as const;
  return (
    <section aria-label="Escalation progress" className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <ol className="flex flex-wrap items-center gap-1.5">
        {stages.map((stage, index) => {
          const done = index < reached || (index === reached && outcome !== null);
          const current = index === reached && running && outcome === null;
          return (
            <li key={stage.key} className="flex items-center gap-1.5">
              {index > 0 && <ArrowRight aria-hidden className={cx("size-4", index <= reached ? "text-ink" : "text-line-strong")} />}
              <span
                className={cx(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[14px] font-semibold",
                  current ? "border-haldi bg-haldi-tint text-ink" : done ? "border-ink bg-ink text-paper" : "border-line text-muted",
                )}
              >
                {current && <span aria-hidden className="size-2 animate-pulse rounded-full bg-haldi-deep" />}
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
      <AnimatePresence>
        {outcome && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cx("rounded-full px-4 py-2 text-[14px] font-semibold lg:ml-auto", outcomeText[outcome].className)} role="status">
            {outcomeText[outcome].text}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

function ArchitectureStrip() {
  const steps = ["EventBridge Scheduler", "Step Functions", "Lambda", "DynamoDB", "Verified Permissions", "Web Push"];
  return (
    <div className="border-t border-line bg-paper/60 px-5 py-4">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Running on AWS · ap-south-1</p>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-ink">
        {steps.map((step, index) => (
          <span key={step} className="inline-flex items-center gap-1.5">
            {index > 0 && <ArrowRight aria-hidden className="size-3 text-muted" />}
            <span className="rounded-md border border-line bg-surface px-1.5 py-0.5">{step}</span>
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
  return { banner, dismiss, reset: () => seen.current.clear() };
}

function PaneLabel({ name, role, city, lang }: { name: string; role: string; city: string; lang: LanguageCode }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Avatar name={name} size={30} />
      <span className="text-left leading-tight">
        <span className="block text-[15px] font-semibold text-ink">
          {name} <span className="font-normal text-muted">· {role}</span>
        </span>
        <span className="block text-[13px] text-muted">
          {city} · <span lang={lang}>{endonym(lang)}</span>
        </span>
      </span>
    </span>
  );
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

  const onTaken = useCallback(async ({ keepalive }: { keepalive: boolean }) => {
    if (doseId) await client.taken(doseId, { keepalive });
  }, [client, doseId]);

  return (
    <PhoneFrame offline={offline} label={<PaneLabel name={session.parent.displayName} role="Mother" city={session.parent.city} lang={session.parent.lang} />}>
      <NotificationBanner
        notification={banner && { ...banner, nowLabel: t("common.now") }}
        onOpen={() => {
          setOpen(true);
          dismiss();
        }}
        onDismiss={dismiss}
      />
      {offline && (
        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-2xl bg-offline px-3 py-2 text-[13px] font-semibold text-white">
          <WifiOff className="size-4" aria-hidden strokeWidth={2.5} /> Airplane mode: reminders wait until the phone is back online
        </div>
      )}
      {dose && open ? (
        <ParentDoseScreen key={dose.doseId} dose={dose} onTaken={onTaken} framed />
      ) : (
        <div className="flex h-full flex-col px-5 pt-4">
          <h2 lang={lang} className="text-[28px] font-semibold tracking-tight">
            {t("parent.today.title")}
          </h2>
          {dose ? (
            <button type="button" onClick={() => setOpen(true)} className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left">
              <BellRing className="size-7 text-due" aria-hidden strokeWidth={2.25} />
              <span className="min-w-0 flex-1">
                <span lang={lang} className="block text-xl font-semibold">
                  {t(`slot.${dose.slotName}`)}
                </span>
                <span lang={lang} className="block text-[16px] text-muted">
                  {dose.status === "TAKEN" || dose.status === "TAKEN_LATE" ? t("parent.status.taken") : dose.status === "CLAIMED" ? t("parent.status.familyHelping") : t("parent.status.waiting")}
                </span>
              </span>
              <ArrowRight className="size-5 text-muted" aria-hidden />
            </button>
          ) : (
            <p lang={lang} className="mt-4 text-xl text-muted">
              {t("parent.today.none")}
            </p>
          )}
          <p className="mt-auto flex items-center gap-2 pb-6 text-[13px] text-muted">
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
  const alertedCount = timeline?.items.some((i) => i.kind === "family_alerted")
    ? ladder.length
    : ladder.filter((m) => timeline?.items.some((i) => i.kind === "member_alerted" && i.people?.includes(m.displayName))).length;

  return (
    <PhoneFrame label={<PaneLabel name={member.displayName} role={member.relation} city={member.city} lang={member.lang} />}>
      <NotificationBanner notification={banner && { ...banner, nowLabel: t("common.now") }} onOpen={dismiss} onDismiss={dismiss} />
      <div className="h-full overflow-y-auto px-4 pb-6 pt-3">
        <div className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="text-[15px] font-semibold">DoseCircle</span>
        </div>
        {alert ? (
          <div className="mt-4">
            <FamilyAlert
              alert={alert}
              viewerLang={member.lang}
              viewerMid={memberId}
              ladder={ladder}
              alertedCount={alertedCount}
              onClaim={() => client.claim(alert.doseId, memberId)}
              onWhy={() => setWhy(true)}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <Avatar name={session.parent.displayName} size={40} />
              <div>
                <p className="text-lg font-semibold">{session.parent.displayName}</p>
                <p lang={lang} className="text-[15px] text-muted">
                  {dose ? t(`status.${dose.status === "TAKEN" ? "taken" : dose.status === "TAKEN_LATE" ? "takenLate" : dose.status === "PENDING" ? "pending" : dose.status === "CLAIMED" ? "claimed" : dose.status === "UNRESOLVED" ? "unresolved" : "escalating"}`) : t("parent.today.none")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {why && timeline && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-[24px] border-t border-line bg-surface shadow-[0_-12px_32px_-16px_rgb(28_25_23/0.4)]">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 lang={lang} className="text-lg font-semibold">
                {t("timeline.title")}
              </h3>
              <button type="button" onClick={() => setWhy(false)} className="min-h-10 rounded-full px-3 text-[15px] font-semibold hover:bg-paper">
                <span lang={lang}>{t("common.close")}</span>
              </button>
            </div>
            <div className="overflow-y-auto px-4">
              <Timeline items={timeline.items} lang={member.lang} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneFrame>
  );
}

function DemoIntro({ onStart, busy, error, simulated }: { onStart: () => void; busy: boolean; error: string | null; simulated: boolean }) {
  const people = [
    { name: "Shantha", role: "Mother", city: "Mysuru", lang: "kn" as LanguageCode, note: "Takes diabetes and blood-pressure tablets, and insulin at night." },
    { name: "Arjun", role: "Son", city: "Bengaluru", lang: "en" as LanguageCode, note: "First in the family order." },
    { name: "Meera", role: "Daughter", city: "Pune", lang: "hi" as LanguageCode, note: "Second in the family order." },
  ];
  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto flex max-w-3xl flex-col px-4 py-10 md:py-16">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <span className="text-xl font-semibold tracking-tight">DoseCircle</span>
        </Link>
        <h1 className="mt-10 text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">Watch a missed dose travel through a family.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          You will see three phones side by side, each in its owner's language. Send a dose, let it go unanswered, and watch the right person get alerted, claim it, and everyone else stand down. It runs on the same AWS workflow as real families, at 60× speed.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {people.map((person) => (
            <li key={person.name} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={person.name} size={36} />
                <div className="leading-tight">
                  <p className="font-semibold">{person.name}</p>
                  <p className="text-[13px] text-muted">
                    {person.role} · {person.city}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[14px] text-muted">
                Uses the app in <span lang={person.lang} className="font-semibold text-ink">{endonym(person.lang)}</span>. {person.note}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button tone="ink" size="lg" onClick={onStart} disabled={busy}>
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" strokeWidth={2.5} aria-hidden />}
            Start the demo
          </Button>
          <p className="text-[14px] text-muted">{simulated ? "Offline simulation: no API is configured." : "Creates a private fictional family that deletes itself after 2 hours."}</p>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-[var(--radius-card)] bg-missed-tint px-4 py-3 font-medium text-missed">
            {error}
          </p>
        )}
        <p className="mt-10 text-[13px] text-muted">All names are fictional. Reminders and family alerts only; this is not medical advice. Best viewed on a laptop.</p>
      </main>
    </div>
  );
}
