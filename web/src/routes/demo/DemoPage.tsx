import type { LanguageCode } from "@dosecircle/shared";
import { LANGUAGES } from "@dosecircle/shared";
import { ArrowRight, BellRing, Camera, HeartPulse, Loader2, Play, RotateCcw, Smartphone, WifiOff, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { FamilyAlert } from "../../components/FamilyAlert";
import { FamilyCircle, type CircleStage } from "../../components/FamilyCircle";
import { Character, type CharacterId } from "../../components/illustrations/Characters";
import { Garland, PetalBurst, Rangoli } from "../../components/illustrations/Festive";
import { Logo } from "../../components/Logo";
import { ParentDoseScreen } from "../../components/ParentDoseScreen";
import { NotificationBanner, PhoneFrame, type BannerNotification } from "../../components/PhoneFrame";
import { Timeline } from "../../components/Timeline";
import { Button, cx } from "../../components/ui";
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

/** The demo's fictional people have drawn characters; order decides who is who if names ever change. */
function characterFor(name: string, index: number): CharacterId {
  const lower = name.toLowerCase();
  if (lower === "arjun") return "arjun";
  if (lower === "meera") return "meera";
  return index === 0 ? "arjun" : "meera";
}

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
  idle: "Send a dose to start. Everything below runs on the real workflow at 60× speed.",
  reminding: "A reminder is ringing on Shantha's phone. If she taps, nobody else is disturbed.",
  checking: "No tap yet. DoseCircle checks whether the reminder even reached her phone.",
  alerting: "Missed. The family is being asked one person at a time, in the order they chose.",
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

  const stage = useMemo(() => stageFor(state, timeline), [state, timeline]);
  const members = session?.members ?? [];
  const alertedIds = useMemo(() => {
    const names = (timeline?.items ?? []).filter((i) => i.kind === "member_alerted").flatMap((i) => i.people ?? []);
    return members.filter((m) => names.includes(m.displayName)).map((m) => m.mid);
  }, [timeline, members]);
  const dose = state?.currentDose ?? null;
  const celebrate = dose && (dose.status === "CLAIMED" || dose.status === "TAKEN" || dose.status === "TAKEN_LATE") ? `${dose.doseId}-${dose.status}` : null;

  if (!session) return <DemoIntro onStart={start} busy={busy === "start"} error={error} simulated={client.simulated} />;

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-paper">
      <PetalBurst burstKey={celebrate} count={36} />

      {/* Indigo stage header */}
      <header className="kolam-light relative bg-indigo text-paper">
        <Garland className="absolute inset-x-0 top-0 h-10 w-full" count={40} />
        <div className="relative mx-auto max-w-[1440px] px-4 pb-8 pt-14 md:px-8">
          <nav className="flex flex-wrap items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5">
              <Logo className="size-9 rounded-[10px] ring-2 ring-paper" />
              <span className="text-xl font-bold tracking-tight">DoseCircle</span>
            </Link>
            <span className="rotate-[-2deg] rounded-full border-2 border-ink bg-haldi px-3 py-1 text-[13px] font-bold text-ink shadow-[2px_2px_0_var(--color-ink)]">Live demo · fictional family</span>
            {client.simulated && <span className="rounded-full border-2 border-ink bg-paper px-3 py-1 text-[13px] font-bold text-offline">Offline simulation</span>}
            <Link to="/demo/prescription" className="pressable ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-[15px] font-bold text-ink shadow-[3px_3px_0_var(--color-ink)]">
              <Camera className="size-4.5" strokeWidth={2.5} aria-hidden />
              Prescription photo
            </Link>
          </nav>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[15px] font-bold uppercase tracking-[0.18em] text-haldi">Mysuru · Bengaluru · Pune</p>
              <h1 className="font-display mt-2 text-5xl md:text-7xl xl:whitespace-nowrap">Shantha's family circle</h1>
            </div>
            <section aria-label="Demo controls" className="sticker flex flex-wrap items-center gap-3 bg-paper p-3 text-ink">
              <Button tone="haldi" size="lg" onClick={sendDose} disabled={running || busy !== null} className="text-xl">
                {busy === "send" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5 fill-ink" strokeWidth={2.5} aria-hidden />}
                Send a dose now
              </Button>
              <Toggle checked={critical} onChange={setCritical} disabled={running} icon={HeartPulse} label="Important medicine" />
              <Toggle checked={parentOffline} onChange={setParentOffline} icon={WifiOff} label="Amma's phone offline" />
              <Button tone="quiet" size="md" onClick={reset} disabled={busy !== null} aria-label="Reset demo">
                <RotateCcw className="size-4.5" strokeWidth={2.5} aria-hidden />
              </Button>
            </section>
          </div>
          {error && (
            <p role="alert" className="sticker-sm mt-4 bg-missed-tint px-4 py-2 font-bold text-missed">
              {error}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-20 md:px-8">
        {/* The live family circle and what the workflow did */}
        <section className="-mt-2 grid gap-6 pt-8 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="sticker kolam relative overflow-hidden bg-surface p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Rangoli size={36} />
              <AnimatePresence mode="wait">
                <motion.p key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="min-w-0 flex-1 text-lg font-bold leading-snug md:text-xl" role="status">
                  {STAGE_CAPTION[stage]}
                </motion.p>
              </AnimatePresence>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-haldi-tint px-3 py-1 text-[13px] font-bold">
                <Zap className="size-3.5 fill-haldi" aria-hidden /> 60× speed
              </span>
            </div>
            <div className="mx-auto -mb-6 mt-0 max-w-[720px]">
              <FamilyCircle
                parent={{ id: session.parent.pid, name: session.parent.displayName, role: "Amma · Mysuru", character: "amma" }}
                members={members.map((m, i) => ({ id: m.mid, name: m.displayName, role: m.relation, character: characterFor(m.displayName, i) }))}
                stage={stage}
                alertedIds={alertedIds}
                claimedById={dose?.claimedBy ?? null}
                parentOffline={parentOffline}
                missClass={dose?.missClass ?? null}
              />
            </div>
          </div>

          <aside className="sticker flex max-h-[720px] flex-col self-start bg-surface xl:sticky xl:top-4">
            <div className="border-b-2 border-ink bg-haldi-tint px-5 py-4">
              <h2 className="font-display text-3xl">Behind the scenes</h2>
              <p className="mt-1 text-[14px] font-medium text-ink/80">Each step names the Step Functions state that ran it, and the Cedar policy that allowed each action.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5">
              {timeline && timeline.items.length > 0 ? (
                <Timeline items={timeline.items} lang="en" live={running} />
              ) : (
                <p className="pb-5 text-[15px] text-muted">The workflow's steps appear here as they happen.</p>
              )}
            </div>
            <ArchitectureStrip />
          </aside>
        </section>

        {/* Three phones, three languages */}
        <section aria-label="Phones" className="mt-12">
          <h2 className="font-display text-4xl md:text-5xl">
            Three phones. <span className="inline-block -rotate-1 border-2 border-ink bg-marigold px-3 pb-1 shadow-[4px_4px_0_var(--color-ink)]">Three languages.</span>
          </h2>
          <p className="mt-2 max-w-2xl text-lg text-muted">Each person reads DoseCircle in their own language. Medicine names always stay exactly as printed on the strip.</p>
          <div className="mt-8 grid gap-x-6 gap-y-12 md:grid-cols-3">
            <Pedestal tone="bg-marigold-tint" character="amma" name={session.parent.displayName} role="Mother" city={session.parent.city} lang={session.parent.lang}>
              <ParentPane session={session} state={state} offline={parentOffline} />
            </Pedestal>
            {members.map((member, index) => (
              <Pedestal key={member.mid} tone={index === 0 ? "bg-sky-tint" : "bg-rose-tint"} character={characterFor(member.displayName, index)} name={member.displayName} role={member.relation} city={member.city} lang={member.lang}>
                <FamilyPane session={session} memberId={member.mid} state={state} timeline={timeline} />
              </Pedestal>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Pedestal({ tone, character, name, role, city, lang, children }: { tone: string; character: CharacterId; name: string; role: string; city: string; lang: LanguageCode; children: React.ReactNode }) {
  return (
    <div className={cx("sticker kolam relative px-3 pb-5 pt-12", tone)}>
      <div className="absolute -top-8 left-4 flex items-end gap-3">
        <Character who={character} size={72} />
        <div className="mb-1 rounded-2xl border-2 border-ink bg-surface px-3 py-1 shadow-[3px_3px_0_var(--color-ink)]">
          <p className="text-[17px] font-extrabold leading-tight">
            {name} <span className="font-medium text-muted">· {role}</span>
          </p>
          <p className="text-[13px] font-medium text-muted">
            {city} · <span lang={lang} className="font-bold text-ink">{endonym(lang)}</span>
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, icon: Icon, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; icon: typeof HeartPulse; label: string }) {
  return (
    <label className={cx("inline-flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[var(--radius-button)] border-2 px-3", checked ? "border-ink bg-haldi-tint" : "border-ink/25 bg-surface", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={cx("relative h-6 w-11 rounded-full border-2 border-ink transition-colors", checked ? "bg-ink" : "bg-paper")}>
        <span className={cx("absolute top-0.5 size-4 rounded-full border-2 border-ink bg-haldi transition-transform duration-200", checked ? "translate-x-[20px]" : "translate-x-0.5")} />
      </span>
      <Icon aria-hidden className="size-4.5" strokeWidth={2.5} />
      <span className="text-[15px] font-bold">{label}</span>
    </label>
  );
}

function ArchitectureStrip() {
  const steps = ["EventBridge Scheduler", "Step Functions", "Lambda", "DynamoDB", "Verified Permissions", "Web Push"];
  return (
    <div className="border-t-2 border-ink bg-indigo px-5 py-4 text-paper">
      <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-haldi">Running on AWS · Mumbai</p>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] font-bold">
        {steps.map((step, index) => (
          <span key={step} className="inline-flex items-center gap-1.5">
            {index > 0 && <ArrowRight aria-hidden className="size-3 text-haldi" />}
            <span className="rounded-md border-[1.5px] border-paper/40 bg-indigo-soft px-1.5 py-0.5">{step}</span>
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
        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-2xl border-2 border-ink bg-offline px-3 py-2 text-[13px] font-bold text-white">
          <WifiOff className="size-4 shrink-0" aria-hidden strokeWidth={2.5} /> Airplane mode: reminders wait until the phone is back online
        </div>
      )}
      {dose && open ? (
        <ParentDoseScreen key={dose.doseId} dose={dose} onTaken={onTaken} framed />
      ) : (
        <div className="flex h-full flex-col px-5 pt-4">
          <h2 lang={lang} className="text-[28px] font-bold tracking-tight">
            {t("parent.today.title")}
          </h2>
          {dose ? (
            <button type="button" onClick={() => setOpen(true)} className="sticker-sm pressable mt-4 flex items-center gap-3 bg-haldi-tint p-4 text-left">
              <BellRing className="size-8 text-due" aria-hidden strokeWidth={2.5} />
              <span className="min-w-0 flex-1">
                <span lang={lang} className="block text-xl font-bold">
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
              <Character who="amma" mood="calm" size={120} />
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
  const index = session.members.indexOf(member);
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
          <span className="text-[16px] font-bold">DoseCircle</span>
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
              parentAvatar={<Character who="amma" mood={alert.status === "ESCALATING" ? "worried" : "happy"} size={52} />}
            />
          </div>
        ) : (
          <div className="sticker-sm mt-4 bg-marigold-tint p-4">
            <div className="flex items-center gap-3">
              <Character who="amma" mood={dose?.status === "TAKEN" ? "happy" : "calm"} size={56} />
              <div>
                <p className="text-xl font-bold">{session.parent.displayName}</p>
                <p lang={lang} className="text-[15px] font-medium">
                  {dose ? t(`status.${dose.status === "TAKEN" ? "taken" : dose.status === "TAKEN_LATE" ? "takenLate" : dose.status === "PENDING" ? "pending" : dose.status === "CLAIMED" ? "claimed" : dose.status === "UNRESOLVED" ? "unresolved" : "escalating"}`) : t("parent.today.none")}
                </p>
              </div>
            </div>
          </div>
        )}
        {!alert && (
          <div className="mt-8 flex justify-center opacity-90">
            <Character who={characterFor(member.displayName, index)} size={96} />
          </div>
        )}
      </div>

      <AnimatePresence>
        {why && timeline && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-[26px] border-t-2 border-ink bg-surface">
            <div className="flex items-center justify-between border-b-2 border-ink bg-haldi-tint px-4 py-3">
              <h3 lang={lang} className="text-lg font-bold">
                {t("timeline.title")}
              </h3>
              <button type="button" onClick={() => setWhy(false)} className="min-h-10 rounded-full border-2 border-ink bg-surface px-3 text-[15px] font-bold">
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
  const people: { name: string; role: string; city: string; lang: LanguageCode; note: string; who: CharacterId; tone: string; tilt: string }[] = [
    { name: "Shantha", role: "Amma", city: "Mysuru", lang: "kn", note: "Diabetes and blood-pressure tablets, insulin at night.", who: "amma", tone: "bg-marigold-tint", tilt: "-rotate-2" },
    { name: "Arjun", role: "Son", city: "Bengaluru", lang: "en", note: "First in the family order.", who: "arjun", tone: "bg-sky-tint", tilt: "rotate-1" },
    { name: "Meera", role: "Daughter", city: "Pune", lang: "hi", note: "Second in the family order.", who: "meera", tone: "bg-rose-tint", tilt: "-rotate-1" },
  ];
  return (
    <div className="kolam min-h-dvh bg-paper">
      <Garland className="h-12 w-full" count={40} />
      <main className="mx-auto flex max-w-5xl flex-col px-4 py-8 md:py-12">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="size-10" />
          <span className="text-2xl font-bold tracking-tight">DoseCircle</span>
        </Link>
        <h1 className="font-display mt-10 max-w-4xl text-6xl md:text-8xl">
          Watch a missed dose travel through <span className="bg-haldi px-2">a family.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-xl font-medium text-muted">
          Three phones side by side, each in its owner's language. Send a dose, let it go unanswered, and watch the right person get alerted, claim it, and everyone else stand down. Same AWS workflow as real families, at 60× speed.
        </p>
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {people.map((person) => (
            <li key={person.name} className={cx("sticker p-5 transition-transform hover:rotate-0", person.tone, person.tilt)}>
              <Character who={person.who} mood="happy" size={88} />
              <p className="mt-3 text-2xl font-extrabold">{person.name}</p>
              <p className="text-[15px] font-bold text-muted">
                {person.role} · {person.city}
              </p>
              <p className="mt-3 inline-flex rounded-full border-2 border-ink bg-surface px-3 py-0.5 text-lg font-bold" lang={person.lang}>
                {endonym(person.lang)}
              </p>
              <p className="mt-3 text-[15px] font-medium">{person.note}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Button tone="haldi" size="lg" onClick={onStart} disabled={busy} className="min-h-16 px-8 text-2xl">
            {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Play className="size-6 fill-ink" strokeWidth={2.5} aria-hidden />}
            Start the demo
          </Button>
          <p className="max-w-sm text-[15px] font-medium text-muted">{simulated ? "Offline simulation: no API is configured." : "Creates a private fictional family that deletes itself after 2 hours."}</p>
        </div>
        {error && (
          <p role="alert" className="sticker-sm mt-4 bg-missed-tint px-4 py-3 font-bold text-missed">
            {error}
          </p>
        )}
        <p className="mt-12 text-[14px] font-medium text-muted">All names are fictional. Reminders and family alerts only; this is not medical advice. Best viewed on a laptop.</p>
      </main>
    </div>
  );
}
