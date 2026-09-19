import type { SlotName } from "@dosecircle/shared";
import { Activity, BellRing, Camera, ChartLine, CirclePause, Loader2, Pill, PillBottle, Plus, Smartphone, TriangleAlert, Users } from "lucide-react";
import { useState } from "react";
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
import { useApi } from "../../lib/useApi";
import { EnableMyAlerts } from "./AuthPages";

export function HomePage() {
  return <RequireFamily>{(me) => <Home fid={me.fid} lang={me.lang} mid={me.mid} role={me.role} />}</RequireFamily>;
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

function Home({ fid, lang: myLang, mid, role }: { fid: string; lang: string; mid: string; role: "owner" | "member" }) {
  const navigate = useNavigate();
  const { t, lang } = useT(myLang);
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid], 30_000);
  const data = dashboard.data;
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const parent = data?.parents.find((p) => p.pid === selectedPid) ?? data?.parents[0];

  return (
    <FamilyShell lang={myLang} full>
      {!data || !parent ? (
        <div className="grid place-items-center py-24">
          <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          <StatusWidget parents={data.parents} openAlerts={data.openAlerts.length} selected={parent} onSelect={setSelectedPid} canAdd={role === "owner"} myLang={myLang} />

          <EnableMyAlerts lang={myLang} />

          <div className="grid items-start gap-5 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              {/* Alerts head the main column rather than spanning the page. There is no heading
                  standing over an empty column when nothing is wrong: the widget has already said
                  "all calm", and saying it twice made the screen look like it was waiting for
                  something to happen. */}
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
              <div>
                <h2 lang={lang} className="mb-3 text-lg font-semibold">
                  {t("dash.today")}
                </h2>
                <TodayCard parent={parent} fid={fid} myLang={myLang} />
              </div>
            </div>
            <div className="space-y-5 lg:col-span-5">
              {/* Seven empty boxes tell a family that has not added a medicine yet nothing at all. */}
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
 * The one thing the home screen owes a family, answered before anything else: is something wrong
 * right now, and if not, what does today look like.
 *
 * It is one band rather than a heading over a card, because a heading needs its own answer
 * underneath and there frequently is none — on a calm day the old layout was two sentences floating
 * in an empty column. The counts run across everybody, not the person the switcher happens to have
 * selected, since "should I be worried" is not a per-person question; the switcher lives up here
 * too, so choosing a person is next to the state of that person rather than adrift below it.
 *
 * The headline never has a number spliced into it — Kannada and Hindi attach case endings to nouns —
 * so the sentence stays whole and the counts sit in their own elements beside it.
 */
function StatusWidget({
  parents,
  openAlerts,
  selected,
  onSelect,
  canAdd,
  myLang,
}: {
  parents: ParentCard[];
  openAlerts: number;
  selected: ParentCard;
  onSelect: (pid: string) => void;
  canAdd: boolean;
  myLang: string;
}) {
  const { t, lang } = useT(myLang);
  const active = parents.filter((p) => !p.paused);
  const doses = active.flatMap((p) => p.today);
  const taken = doses.filter((d) => d.status === "TAKEN" || d.status === "TAKEN_LATE").length;
  const missed = doses.filter((d) => d.status === "UNRESOLVED" || (d.status === "CLAIMED" && d.missClass === "MISSED")).length;
  // Counted off the slots, not the dose records: a slot later today has no dose row yet, and the
  // list underneath already shows it as "later today". An escalating dose is left out of all three
  // — the headline and the alert beside it are about that dose, and counting it here as well would
  // say the same thing twice.
  const due = active.reduce((n, p) => n + p.slots.filter((s) => (p.today.find((d) => d.slotName === s.slotName)?.status ?? "PENDING") === "PENDING").length, 0);
  // "ok" chips are in the list so a medicine's stock can be shown anywhere; a medicine with three
  // weeks left is not running low, and counting it here made the number say something untrue.
  const refills = parents.reduce((n, p) => n + p.refills.filter(isLow).length, 0);
  const allPaused = parents.length > 0 && parents.every((p) => p.paused);
  const noMedicines = parents.every((p) => p.slots.length === 0);

  const state = openAlerts > 0 ? "alert" : allPaused ? "paused" : noMedicines ? "empty" : missed > 0 ? "missed" : "calm";
  const { Icon, headline, dot } = {
    alert: { Icon: TriangleAlert, headline: t("home.statusNeedsYou"), dot: "bg-[#ff8a80] text-[#4a0d07]" },
    missed: { Icon: TriangleAlert, headline: t("home.statusMissed"), dot: "bg-haldi text-[#14133a]" },
    paused: { Icon: CirclePause, headline: t("home.paused"), dot: "bg-white/20 text-white" },
    empty: { Icon: Pill, headline: t("home.noMedicines"), dot: "bg-white/20 text-white" },
    calm: { Icon: BellRing, headline: t("home.allCalm"), dot: "bg-[#4ade9a] text-[#03301f]" },
  }[state];

  return (
    <section aria-labelledby="status-headline" className="hero-surface relative overflow-hidden rounded-[24px]">
      <div aria-hidden className="hero-grid absolute inset-0" />
      <div className="relative p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span aria-hidden className={cx("grid size-12 shrink-0 place-items-center rounded-full", dot)}>
              <Icon className="size-6" strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <h1 id="status-headline" lang={lang} className="text-balance text-[22px] font-semibold leading-tight tracking-tight text-white md:text-[27px]">
                {headline}
              </h1>
              {/* Two items, not four: as four flex children this wrapped into ragged columns on a
                  phone. The time keeps its own element so the sentence is never spliced. */}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-hero-muted">
                <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                  <Smartphone aria-hidden className="size-4 shrink-0" />
                  {selected.displayName}
                </span>
                {selected.lastReceiptAt ? (
                  <span lang={lang}>
                    {t("home.lastReachable")} <span className="tabular font-semibold text-white">{formatAgo(selected.lastReceiptAt, lang)}</span>
                  </span>
                ) : (
                  <span lang={lang}>{t("home.neverReachable")}</span>
                )}
              </p>
            </div>
          </div>

          <nav aria-label={t("home.everyone")} className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex flex-wrap gap-2">
              {parents.map((p) => (
                <button
                  key={p.pid}
                  type="button"
                  role="tab"
                  aria-selected={p.pid === selected.pid}
                  onClick={() => onSelect(p.pid)}
                  className={cx(
                    "pressable inline-flex min-h-10 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[14.5px] font-semibold transition-colors",
                    p.pid === selected.pid ? "bg-white text-[#14133a]" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15",
                  )}
                >
                  <Avatar name={p.displayName} size={26} className={p.pid === selected.pid ? undefined : "!bg-white/15 !text-white"} />
                  {p.displayName}
                  {p.paused && <CirclePause aria-hidden className="size-4 opacity-70" />}
                </button>
              ))}
            </div>
            {canAdd && (
              <Link to="/people#add" className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-white/30 px-3.5 text-[14px] font-semibold text-hero-muted hover:border-white/60 hover:text-white">
                <Plus aria-hidden className="size-4" strokeWidth={2.5} />
                <span lang={lang}>{t("people.addParent")}</span>
              </Link>
            )}
          </nav>
        </div>

        {state !== "empty" && (
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t("home.statTaken"), value: taken, accent: false },
              { label: t("home.statDue"), value: due, accent: false },
              { label: t("home.statMissed"), value: missed, accent: missed > 0 },
              { label: t("home.refills"), value: refills, accent: refills > 0 },
            ].map(({ label, value, accent }) => (
              <div key={label} className={cx("rounded-2xl px-4 py-3 ring-1", accent ? "bg-haldi/15 ring-haldi/40" : "bg-white/8 ring-white/12")}>
                <dt lang={lang} className={cx("text-[13px] font-medium", accent ? "text-haldi" : "text-hero-muted")}>
                  {label}
                </dt>
                <dd className={cx("tabular mt-0.5 text-[30px] font-semibold leading-none tracking-tight", accent ? "text-haldi" : "text-white")}>{formatNumber(value, lang)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/** A refill chip only counts as a warning once it has actually dropped below its own threshold. */
const isLow = (refill: RefillChip) => refill.level !== "ok";

/** The last seven days at a glance — the cheapest honest answer to "is this getting better". */
function WeekCard({ parent, myLang }: { parent: ParentCard; myLang: string }) {
  const { t, lang } = useT(myLang);
  return (
    <section className="sticker bg-surface p-4">
      <h2 lang={lang} className="mb-3 text-[15px] font-semibold">
        {t("home.week")}
      </h2>
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

function TodayCard({ parent, fid, myLang }: { parent: ParentCard; fid: string; myLang: string }) {
  const { t, lang } = useT(myLang);
  const [testState, setTestState] = useState<"idle" | "sent" | "limit">("idle");

  const sendTest = async () => {
    try {
      await api(`/families/${fid}/parents/${parent.pid}/test-dose`, { method: "POST", auth: "family", body: {} });
      setTestState("sent");
    } catch (error) {
      setTestState(error instanceof ApiError && error.status === 429 ? "limit" : "idle");
    }
  };

  const base = `/parents/${parent.pid}`;
  const empty = parent.slots.length === 0;
  return (
    <section className="sticker overflow-hidden bg-surface">
      {parent.paused && (
        <p lang={lang} className="flex items-center gap-2 border-b border-line bg-offline-tint px-4 py-2.5 font-medium text-offline">
          <CirclePause aria-hidden className="size-5" /> {t("home.paused")}
        </p>
      )}
      {empty ? (
        /* A new family lands here, and the widget above has already said there are no medicines.
           Repeating the sentence taught them nothing, so this is the one way to fix it instead —
           and it stands in for the "Medicines" tile below, which in this state opens a page whose
           only content is this same button. */
        <div className="p-5">
          <Link to={`${base}/prescription`} className="pressable inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-indigo px-4 text-[16.5px] font-semibold text-white shadow-[0_8px_20px_-12px_rgb(37_35_110/0.9)]">
            <Camera aria-hidden className="size-5.5" strokeWidth={2.25} />
            <span lang={lang}>{t("meds.scan")}</span>
          </Link>
          <Link to={`${base}/medicines`} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-muted hover:text-ink">
            <Plus aria-hidden className="size-4.5" strokeWidth={2.5} />
            <span lang={lang}>{t("meds.add")}</span>
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {[...parent.slots]
            .sort((a, b) => SLOT_ORDER.indexOf(a.slotName) - SLOT_ORDER.indexOf(b.slotName))
            .map((slot) => {
              const dose = parent.today.find((d) => d.slotName === slot.slotName);
              const Icon = SLOT_ICONS[slot.slotName];
              return (
                <li key={slot.slotName} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid size-9 place-items-center rounded-lg bg-sunken">
                    <Icon aria-hidden className="size-4.5 text-ink" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0">
                    <span lang={lang} className="block font-semibold">
                      {t(`slot.${slot.slotName}`)}
                    </span>
                    <span className="tabular block text-[13.5px] text-muted">{`${slot.compactTime.slice(0, 2)}:${slot.compactTime.slice(2)}`}</span>
                  </span>
                  <span className="ml-auto">
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
      {/* Four things a family does from here, all at a size an older reader can hit without aiming.
          On a phone each tile puts its icon above the label: side by side, a 147px tile left
          "Daily checks" about 85px and every label but one folded onto two lines.
          Settings moved to the header, where it is on every screen, and the charts and the doctor's
          report moved to their own page — neither belongs in the list you reach for when you are
          checking whether Amma took her tablet. */}
      <nav className="grid grid-cols-2 gap-2 border-t border-line bg-paper/60 p-3">
        {[...(empty ? [] : [{ to: `${base}/medicines`, icon: Pill, label: t("action.medicines") }]), { to: `${base}/checks`, icon: Activity, label: t("action.checks") }].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className="pressable inline-flex min-h-[76px] flex-col items-start justify-center gap-1.5 rounded-xl py-3 text-left leading-tight sm:min-h-14 sm:flex-row sm:items-center sm:gap-2.5 sm:py-0 bg-indigo px-3.5 text-[16px] sm:px-4 sm:text-[16.5px] font-semibold text-white shadow-[0_8px_20px_-12px_rgb(37_35_110/0.9)]">
            <Icon aria-hidden className="size-5.5 shrink-0" strokeWidth={2.25} />
            <span lang={lang}>{label}</span>
          </Link>
        ))}
        <Link to="/people" className="pressable inline-flex min-h-[76px] flex-col items-start justify-center gap-1.5 rounded-xl py-3 text-left leading-tight sm:min-h-14 sm:flex-row sm:items-center sm:gap-2.5 sm:py-0 bg-surface px-3.5 text-[16px] sm:px-4 sm:text-[16.5px] font-semibold text-ink ring-1 ring-line-strong hover:ring-indigo-soft">
          <Users aria-hidden className="size-5.5 shrink-0 text-muted" strokeWidth={2.25} />
          <span lang={lang}>{t("action.people")}</span>
        </Link>
        <button
          type="button"
          onClick={sendTest}
          disabled={testState !== "idle"}
          className="pressable inline-flex min-h-[76px] flex-col items-start justify-center gap-1.5 rounded-xl py-3 text-left leading-tight sm:min-h-14 sm:flex-row sm:items-center sm:gap-2.5 sm:py-0 bg-surface px-3.5 text-[16px] sm:px-4 sm:text-[16.5px] font-semibold text-ink ring-1 ring-line-strong hover:ring-indigo-soft disabled:opacity-60"
        >
          <BellRing aria-hidden className="size-5.5 shrink-0 text-muted" strokeWidth={2.25} />
          <span lang={lang}>{t("action.testReminder")}</span>
        </button>
        {testState !== "idle" && (
          <p lang={lang} role="status" className="col-span-2 px-1 text-[13.5px] text-muted">
            {testState === "sent" ? t("action.testSent") : t("action.testLimit")}
          </p>
        )}
        <Link to={`${base}/insights`} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-muted hover:text-ink">
          <ChartLine aria-hidden className="size-4.5" strokeWidth={2.25} />
          <span lang={lang}>{t("action.insights")}</span>
        </Link>
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
