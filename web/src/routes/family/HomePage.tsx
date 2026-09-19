import type { SlotName } from "@dosecircle/shared";
import { Activity, ArrowRight, BellRing, Camera, CirclePause, Loader2, Pill, PillBottle, Plus, Smartphone, TriangleAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FamilyAlert } from "../../components/FamilyAlert";
import { FamilyShell } from "../../components/FamilyShell";
import { Timeline } from "../../components/Timeline";
import { OutcomeLegend, WeekStrip } from "../../components/WeekStrip";
import { Avatar, Card, cx, SLOT_ICONS, StatusPill } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { formatAgo, formatNumber, formatTime } from "../../lib/format";
import type { Dashboard, ParentCard, RefillChip, Timeline as TimelineData } from "../../lib/types";
import { currentPerson, rememberPerson } from "../../lib/person";
import { useApi } from "../../lib/useApi";
import { EnableMyAlerts } from "./AuthPages";

export function HomePage() {
  return <RequireFamily>{(me) => <Home fid={me.fid} lang={me.lang} mid={me.mid} role={me.role} name={me.displayName} />}</RequireFamily>;
}

function claimDose(doseId: string): Promise<"claimed" | "lost"> {
  return api(`/doses/${encodeURIComponent(doseId)}/claim`, { method: "POST", auth: "family" }).then(
    () => "claimed" as const,
    (error) => {
      if (error instanceof ApiError && error.status === 409) return "lost" as const;
      throw error;
    },
  );
}

function Home({ fid, lang: myLang, mid, role, name }: { fid: string; lang: string; mid: string; role: "owner" | "member"; name: string }) {
  const navigate = useNavigate();
  const { t, lang } = useT(myLang);
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid], 30_000);
  const data = dashboard.data;
  const [selectedPid, setSelectedPid] = useState<string | null>(currentPerson);
  const parent = data?.parents.find((p) => p.pid === selectedPid) ?? data?.parents[0];
  // The navigation's Medicines, Checks and "How it is going" follow whoever is chosen here.
  useEffect(() => {
    if (parent) rememberPerson(parent.pid);
  }, [parent?.pid]);

  return (
    <FamilyShell lang={myLang} full>
      {!data || !parent ? (
        <div className="grid place-items-center py-24">
          <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-7">
          <StatusHeader parents={data.parents} openAlerts={data.openAlerts.length} name={name} myLang={myLang} />

          {/* Always visible, even with one person: it is how you learn the app holds more than one,
              and it is where you add the next. Everything below follows whoever is chosen. */}
          <nav aria-label={t("home.everyone")} className="flex flex-wrap items-center gap-2">
            <span lang={lang} className="eyebrow mr-2">
              {t("home.everyone")}
            </span>
            <div role="tablist" className="flex flex-wrap gap-2">
              {data.parents.map((p) => (
                <button
                  key={p.pid}
                  type="button"
                  role="tab"
                  aria-selected={p.pid === parent.pid}
                  onClick={() => setSelectedPid(p.pid)}
                  className={cx(
                    "pressable inline-flex min-h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-[15px] font-semibold transition-colors",
                    p.pid === parent.pid ? "bg-indigo text-white shadow-[0_8px_20px_-12px_rgb(31_63_55/0.55)]" : "bg-surface text-ink ring-1 ring-line hover:ring-line-strong",
                  )}
                >
                  <Avatar name={p.displayName} size={30} className={p.pid === parent.pid ? "!bg-white/15 !text-white" : undefined} />
                  {p.displayName}
                  {p.paused && <CirclePause aria-hidden className="size-4 opacity-70" />}
                </button>
              ))}
            </div>
            {role === "owner" && (
              <Link to="/people#add" className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 text-[14.5px] font-semibold text-muted hover:border-indigo/40 hover:text-ink">
                <Plus aria-hidden className="size-4" strokeWidth={2.5} />
                <span lang={lang}>{t("people.addParent")}</span>
              </Link>
            )}
          </nav>

          <EnableMyAlerts lang={myLang} />

          <div className="grid items-start gap-5 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-5">
              {/* Alerts head the main column: the most urgent thing on the page, where the eye is. */}
              {data.openAlerts.length > 0 && (
                <section aria-label={t("home.openAlerts")} className="grid gap-4">
                  {data.openAlerts.map((alert) => {
                    const alertParent = data.parents.find((p) => p.pid === alert.pid);
                    return (
                      <FamilyAlert
                        key={alert.doseId}
                        alert={alert}
                        viewerLang={myLang}
                        viewerMid={mid}
                        ladder={alertParent?.ladder ?? []}
                        alertedCount={alert.alertedCount}
                        onClaim={async () => {
                          const result = await claimDose(alert.doseId);
                          await dashboard.reload();
                          return result;
                        }}
                        onWhy={() => navigate(`/alerts/${encodeURIComponent(alert.doseId)}`)}
                      />
                    );
                  })}
                </section>
              )}
              <TodayCard parent={parent} fid={fid} myLang={myLang} />
            </div>
            <div className="space-y-5">
              {/* A ring of seven empty days tells a family with no medicines yet nothing at all. */}
              {parent.slots.length > 0 && <WeekCard parent={parent} myLang={myLang} />}
              <StandingCard parent={parent} myLang={myLang} />
            </div>
          </div>
        </div>
      )}
    </FamilyShell>
  );
}

/**
 * The first thing the home screen owes a family: is something wrong right now.
 *
 * A greeting, then one sentence with a coloured dot that answers it, then four counts. The counts run
 * across everybody, not the person the switcher happens to have selected, since "should I be worried"
 * is not a per-person question.
 *
 * Nothing is spliced into a translated sentence — Kannada and Hindi inflect nouns — so the name sits
 * beside the greeting and the counts live in their own elements.
 */
function StatusHeader({ parents, openAlerts, name, myLang }: { parents: ParentCard[]; openAlerts: number; name: string; myLang: string }) {
  const { t, lang } = useT(myLang);
  const active = parents.filter((p) => !p.paused);
  const doses = active.flatMap((p) => p.today);
  const taken = doses.filter((d) => d.status === "TAKEN" || d.status === "TAKEN_LATE").length;
  const missed = doses.filter((d) => d.status === "UNRESOLVED" || (d.status === "CLAIMED" && d.missClass === "MISSED")).length;
  // Counted off the slots, not the dose records: a slot later today has no dose row yet, and the
  // list underneath shows it as "later today". An escalating dose is left out of all three — the
  // headline and the alert below are about that dose, and counting it here too would say it twice.
  const due = active.reduce((n, p) => n + p.slots.filter((s) => (p.today.find((d) => d.slotName === s.slotName)?.status ?? "PENDING") === "PENDING").length, 0);
  // "ok" chips are in the list so stock can be shown anywhere; three weeks left is not running low.
  const refills = parents.reduce((n, p) => n + p.refills.filter(isLow).length, 0);
  const allPaused = parents.length > 0 && parents.every((p) => p.paused);
  const noMedicines = parents.every((p) => p.slots.length === 0);

  const state = openAlerts > 0 ? "alert" : allPaused ? "paused" : noMedicines ? "empty" : missed > 0 ? "missed" : "calm";
  const { headline, dot, ink } = {
    alert: { headline: t("home.statusNeedsYou"), dot: "bg-missed", ink: "text-missed" },
    missed: { headline: t("home.statusMissed"), dot: "bg-due", ink: "text-due" },
    paused: { headline: t("home.paused"), dot: "bg-offline", ink: "text-offline" },
    empty: { headline: t("home.noMedicines"), dot: "bg-line-strong", ink: "text-muted" },
    calm: { headline: t("home.allCalm"), dot: "bg-taken-fill", ink: "text-taken" },
  }[state];
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "home.greeting.morning" : hour < 17 ? "home.greeting.afternoon" : "home.greeting.evening");

  return (
    <section aria-labelledby="status-headline" className="space-y-6">
      <div>
        <h1 className="font-display text-[34px] md:text-[42px]">
          <span lang={lang}>{greeting}</span>, {name}
        </h1>
        <p id="status-headline" className="mt-2 flex items-center gap-2.5 text-[16px]">
          <span aria-hidden className="relative flex size-2.5 shrink-0">
            {state === "alert" && <span className={cx("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden", dot)} />}
            <span className={cx("relative inline-flex size-2.5 rounded-full", dot)} />
          </span>
          <span lang={lang} className={cx("font-medium", ink)}>
            {headline}
          </span>
        </p>
      </div>
      {state !== "empty" && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: t("home.statTaken"), value: taken, warn: false },
            { label: t("home.statDue"), value: due, warn: false },
            { label: t("home.statMissed"), value: missed, warn: missed > 0 },
            { label: t("home.refills"), value: refills, warn: refills > 0 },
          ].map(({ label, value, warn }) => (
            <div key={label} className={cx("sticker px-5 py-4", warn ? "border-due/30 bg-due-tint/60" : "bg-surface")}>
              <dt lang={lang} className={cx("text-[13.5px]", warn ? "font-medium text-due" : "text-muted")}>
                {label}
              </dt>
              <dd className={cx("font-serif-num mt-1 text-[32px] leading-none", warn ? "text-due" : "text-ink")}>{formatNumber(value, lang)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** A refill chip only counts as a warning once it has actually dropped below its own threshold. */
const isLow = (refill: RefillChip) => refill.level !== "ok";

/**
 * This week at a glance: the share of doses taken as a ring, then the days themselves. Unknown
 * (phone offline) doses count neither way — they are not a miss.
 */
function WeekCard({ parent, myLang }: { parent: ParentCard; myLang: string }) {
  const { t, lang } = useT(myLang);
  const outcomes = parent.week.flatMap((d) => d.outcomes);
  const took = outcomes.filter((o) => o === "on_time" || o === "late").length;
  const known = took + outcomes.filter((o) => o === "missed").length;
  const share = known > 0 ? took / known : null;
  return (
    <section className="sticker bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 lang={lang} className="font-display text-[23px]">
          {t("home.week")}
        </h2>
        <Link to={`/parents/${parent.pid}/insights`} className="inline-flex min-h-10 items-center gap-1 text-[14px] font-semibold text-indigo-soft hover:underline">
          <span lang={lang}>{t("action.insights")}</span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="my-5 flex flex-col items-center">
        <div
          role="img"
          aria-label={`${t("dash.adherence")}: ${share === null ? "–" : formatNumber(share, lang, { style: "percent" })}`}
          className="grid size-[148px] place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--color-indigo) ${(share ?? 0) * 100}%, var(--color-sunken) 0)` }}
        >
          <div className="grid size-[118px] place-items-center rounded-full bg-surface text-center">
            <div>
              <p className="font-serif-num text-[32px] leading-none">{share === null ? "–" : formatNumber(share, lang, { style: "percent" })}</p>
              <p lang={lang} className="mt-1 text-[12.5px] text-muted">
                {t("dash.adherence")}
              </p>
            </div>
          </div>
        </div>
      </div>
      <WeekStrip week={parent.week} t={t} lang={lang} />
      <div className="mt-3">
        <OutcomeLegend t={t} lang={lang} />
      </div>
    </section>
  );
}

/**
 * Two questions a family member asks about themselves rather than about the parent: are any tablets
 * about to run out, and when something goes wrong, is it me who gets called.
 */
function StandingCard({ parent, myLang }: { parent: ParentCard; myLang: string }) {
  const { t, lang } = useT(myLang);
  const low = parent.refills.filter(isLow);
  return (
    <section className="sticker divide-y divide-line bg-surface">
      {low.length > 0 && (
        <div className="p-4">
          <h2 lang={lang} className="mb-2.5 text-[15px] font-semibold">
            {t("home.refills")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {low.map((refill) => (
              <li
                key={refill.medId}
                className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold", refill.level === "critical" ? "bg-missed-tint text-missed" : "bg-due-tint text-due")}
              >
                <PillBottle aria-hidden className="size-4" strokeWidth={2.25} />
                <span lang="en" className="medicine-name">
                  {refill.nameAsPrinted}
                </span>
                {refill.daysLeft !== null && <span className="tabular font-normal opacity-80">{formatNumber(refill.daysLeft, lang, { style: "unit", unit: "day", unitDisplay: "long" })}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-3 p-4">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-muted">
          <Users className="size-4.5" strokeWidth={2.25} />
        </span>
        <p className="min-w-0 text-[14.5px]">
          {parent.myLadderPosition === null ? (
            <span lang={lang} className="text-muted">
              {t("home.notInOrder")}
            </span>
          ) : (
            <>
              <span lang={lang} className="block text-muted">
                {t("home.yourPosition")}
              </span>
              <span className="tabular text-[17px] font-semibold text-ink">{formatNumber(parent.myLadderPosition, lang)}</span>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

const SLOT_ORDER: SlotName[] = ["morning", "afternoon", "evening", "night"];

/** Why a test reminder could not be sent. The first five come from the server, with the same names. */
const TEST_FAILURES = ["no_medicines", "nothing_due", "paused", "no_phone", "no_notifications", "limit", "unknown"] as const;
type TestFailure = (typeof TEST_FAILURES)[number];

/** Where to go to fix it, when there is one place that does. */
const TEST_FIX: Partial<Record<TestFailure, (pid: string) => string>> = {
  no_medicines: (pid) => `/parents/${pid}/medicines`,
  nothing_due: (pid) => `/parents/${pid}/medicines`,
  paused: (pid) => `/parents/${pid}/settings`,
  no_phone: () => "/people",
};

function TodayCard({ parent, fid, myLang }: { parent: ParentCard; fid: string; myLang: string }) {
  const { t, lang } = useT(myLang);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "sent" } | { state: "failed"; reason: TestFailure }>({ state: "idle" });

  const sendTest = async () => {
    setTest({ state: "busy" });
    try {
      await api(`/families/${fid}/parents/${parent.pid}/test-dose`, { method: "POST", auth: "family", body: {} });
      setTest({ state: "sent" });
    } catch (error) {
      // Every failure says why. This used to recognise only the daily limit and quietly reset the
      // button for anything else, so with no medicines added a tap simply did nothing.
      const reason = error instanceof ApiError ? (error.body.reason as string | undefined) : undefined;
      setTest({ state: "failed", reason: TEST_FAILURES.includes(reason as TestFailure) ? (reason as TestFailure) : error instanceof ApiError && error.status === 429 ? "limit" : "unknown" });
    }
  };

  const base = `/parents/${parent.pid}`;
  const empty = parent.slots.length === 0;
  const pill = "pressable inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl px-3 text-center text-[15px] font-semibold leading-tight sm:gap-2 sm:px-4";
  return (
    <section className="sticker overflow-hidden bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-5 pb-4 pt-5">
        <h2 lang={lang} className="font-display text-[23px]">
          {t("home.todayMeds")}
        </h2>
        {/* The phone's last word, so "no tap yet" can be read against "is the phone even on". */}
        <p className="flex items-center gap-1.5 text-[13.5px] text-muted">
          <Smartphone aria-hidden className="size-4 shrink-0" />
          {parent.lastReceiptAt ? (
            <span lang={lang}>
              {t("home.lastReachable")} <span className="tabular font-semibold text-ink">{formatAgo(parent.lastReceiptAt, lang)}</span>
            </span>
          ) : (
            <span lang={lang}>{t("home.neverReachable")}</span>
          )}
        </p>
      </div>
      {parent.paused && (
        <p lang={lang} className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-offline-tint px-4 py-2.5 font-medium text-offline">
          <CirclePause aria-hidden className="size-5" /> {t("home.paused")}
        </p>
      )}
      {empty ? (
        /* A new family lands here; the header has already said there are no medicines, so this is
           the one way to fix it — and it stands in for the "Medicines" button, which in this state
           opens a page whose only content is this same button. */
        <div className="px-5 pb-5">
          <Link to={`${base}/prescription`} className={cx(pill, "w-full bg-indigo text-white shadow-[0_8px_20px_-12px_rgb(31_63_55/0.6)] hover:bg-indigo-deep")}>
            <Camera aria-hidden className="size-5" strokeWidth={2.25} />
            <span lang={lang}>{t("meds.scan")}</span>
          </Link>
          <Link to={`${base}/medicines`} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-muted hover:text-ink">
            <Plus aria-hidden className="size-4.5" strokeWidth={2.5} />
            <span lang={lang}>{t("meds.add")}</span>
          </Link>
        </div>
      ) : (
        <ul className="space-y-2 px-5 pb-5">
          {[...parent.slots]
            .sort((a, b) => SLOT_ORDER.indexOf(a.slotName) - SLOT_ORDER.indexOf(b.slotName))
            .map((slot) => {
              const dose = parent.today.find((d) => d.slotName === slot.slotName);
              const Icon = SLOT_ICONS[slot.slotName];
              return (
                <li key={slot.slotName} className="grid min-h-[72px] grid-cols-[58px_1fr_auto] items-center gap-3 rounded-[13px] border border-line px-4 py-3">
                  <span className="font-serif-num text-[17px]">{`${slot.compactTime.slice(0, 2)}:${slot.compactTime.slice(2)}`}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Icon aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={2.25} />
                      <span lang={lang}>{t(`slot.${slot.slotName}`)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                      <Pill aria-hidden className="size-3.5" strokeWidth={2.25} />
                      <span className="tabular">{formatNumber(slot.medicineCount, lang)}</span>
                    </span>
                  </span>
                  <span className="justify-self-end">
                    {dose ? (
                      <Link to={`/alerts/${encodeURIComponent(dose.doseId)}`}>
                        <StatusPill status={dose.status} missClass={dose.missClass} t={t} lang={lang} />
                      </Link>
                    ) : (
                      <span lang={lang} className="text-[14px] text-muted">
                        {t("parent.status.later")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
      {/* Four things a family does from here, at a size an older reader can hit without aiming:
          medicines and daily checks first and filled, the family and a test reminder beside them. */}
      <nav className="grid grid-cols-2 gap-2 border-t border-line bg-sunken/50 p-4">
        {[...(empty ? [] : [{ to: `${base}/medicines`, icon: Pill, label: t("action.medicines") }]), { to: `${base}/checks`, icon: Activity, label: t("action.checks") }].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className={cx(pill, "bg-indigo text-white shadow-[0_8px_20px_-12px_rgb(31_63_55/0.6)] hover:bg-indigo-deep")}>
            <Icon aria-hidden className="size-5 shrink-0" strokeWidth={2.25} />
            <span lang={lang}>{label}</span>
          </Link>
        ))}
        <Link to="/people" className={cx(pill, "bg-surface text-ink ring-1 ring-line-strong hover:ring-indigo/40")}>
          <Users aria-hidden className="size-5 shrink-0 text-muted" strokeWidth={2.25} />
          <span lang={lang}>{t("action.people")}</span>
        </Link>
        <button type="button" onClick={sendTest} disabled={test.state === "busy" || test.state === "sent"} className={cx(pill, "bg-surface text-ink ring-1 ring-line-strong hover:ring-indigo/40 disabled:opacity-60")}>
          {test.state === "busy" ? <Loader2 aria-hidden className="size-5 shrink-0 animate-spin text-muted" /> : <BellRing aria-hidden className="size-5 shrink-0 text-muted" strokeWidth={2.25} />}
          <span lang={lang}>{t("action.testReminder")}</span>
        </button>
        {test.state === "sent" && (
          <p lang={lang} role="status" className="col-span-2 flex items-start gap-2 rounded-xl bg-taken-tint px-3 py-2.5 text-[14px] font-medium text-taken">
            <BellRing aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("action.testSent")}
          </p>
        )}
        {test.state === "failed" && (
          <div role="alert" className="col-span-2 flex items-start gap-2 rounded-xl bg-missed-tint px-3 py-2.5 text-[14px] text-missed">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p lang={lang} className="font-medium">
              {t(`action.testFailed.${test.reason}`)}
              {TEST_FIX[test.reason] && (
                <>
                  {" "}
                  <Link to={TEST_FIX[test.reason]!(parent.pid)} className="font-semibold underline underline-offset-2">
                    {t(`action.testFix.${test.reason}`)}
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </nav>
    </section>
  );
}

/** /alerts/:doseId — opened from a family notification: the alert, then the full story. */
export function AlertPage() {
  return <RequireFamily>{(me) => <Alert fid={me.fid} mid={me.mid} lang={me.lang} />}</RequireFamily>;
}

function Alert({ fid, mid, lang: myLang }: { fid: string; mid: string; lang: string }) {
  const { doseId = "" } = useParams();
  const { t, lang } = useT(myLang);
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid], 10_000);
  const timeline = useApi(() => api<TimelineData>(`/doses/${encodeURIComponent(doseId)}/timeline`, { auth: "family" }), [doseId], 10_000);
  const alert = dashboard.data?.openAlerts.find((a) => a.doseId === doseId);
  const parent = dashboard.data?.parents.find((p) => p.pid === alert?.pid);

  return (
    <FamilyShell lang={myLang} back="/home" title={timeline.data?.parentName}>
      <div className="space-y-6">
        {alert && (
          <FamilyAlert
            alert={alert}
            viewerLang={myLang}
            viewerMid={mid}
            ladder={parent?.ladder ?? []}
            alertedCount={alert.alertedCount}
            onClaim={async () => {
              const result = await claimDose(doseId);
              await Promise.all([dashboard.reload(), timeline.reload()]);
              return result;
            }}
            onWhy={() => document.getElementById("what-happened")?.scrollIntoView({ behavior: "smooth" })}
          />
        )}
        {timeline.data && (
          <Card className="p-4">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 id="what-happened" lang={lang} className="text-xl font-semibold">
                {t("timeline.title")}
              </h2>
              <StatusPill status={timeline.data.status} missClass={timeline.data.missClass} t={t} lang={lang} />
              <span className="tabular text-[14px] text-muted">
                <span lang={lang}>{t(`slot.${timeline.data.slotName}`)}</span> · {formatTime(timeline.data.scheduledAt, lang)}
              </span>
            </div>
            <Timeline items={timeline.data.items} lang={myLang} />
          </Card>
        )}
      </div>
    </FamilyShell>
  );
}
