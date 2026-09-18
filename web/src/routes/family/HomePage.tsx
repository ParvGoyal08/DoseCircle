import type { SlotName } from "@dosecircle/shared";
import { Activity, BellRing, ChevronRight, CirclePause, FileText, Loader2, Pill, Plus, Settings, Smartphone, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FamilyAlert } from "../../components/FamilyAlert";
import { FamilyShell } from "../../components/FamilyShell";
import { InsightsGrid, InsightsHero } from "../../components/InsightsDashboard";
import { Timeline } from "../../components/Timeline";
import { OutcomeLegend, WeekStrip } from "../../components/WeekStrip";
import { Avatar, Button, Card, cx, SLOT_ICONS, StatusPill } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { formatAgo, formatNumber, formatTime } from "../../lib/format";
import type { Dashboard, Insights, ParentCard, Timeline as TimelineData } from "../../lib/types";
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
  const [days, setDays] = useState<7 | 30>(30);
  const parent = data?.parents.find((p) => p.pid === selectedPid) ?? data?.parents[0];
  const insights = useApi(parent ? () => api<Insights>(`/families/${fid}/parents/${parent.pid}/insights`, { auth: "family", query: { days: String(days) } }) : null, [fid, parent?.pid, days]);

  return (
    <FamilyShell lang={myLang} full>
      {!data || !parent ? (
        <div className="grid place-items-center py-24">
          <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Always visible, even with one person: it is how you learn the app holds more than one,
              and it is where you add the next. */}
          <nav aria-label={t("home.everyone")} className="flex flex-wrap items-center gap-2">
            <span lang={lang} className="mr-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
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
                    "pressable inline-flex min-h-11 items-center gap-2 rounded-full pl-1.5 pr-4 font-semibold",
                    p.pid === parent.pid ? "bg-indigo text-white" : "bg-surface text-ink ring-1 ring-line hover:ring-line-strong",
                  )}
                >
                  <Avatar name={p.displayName} size={28} className={p.pid === parent.pid ? "!bg-white/15 !text-white" : undefined} />
                  {p.displayName}
                  {p.paused && <CirclePause aria-hidden className="size-4 opacity-70" />}
                </button>
              ))}
            </div>
            {role === "owner" && (
              <Link
                to="/people#add"
                className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 text-[14.5px] font-semibold text-muted hover:border-indigo-soft hover:text-ink"
              >
                <Plus aria-hidden className="size-4" strokeWidth={2.5} />
                <span lang={lang}>{t("people.addParent")}</span>
              </Link>
            )}
          </nav>

          <EnableMyAlerts lang={myLang} />

          {insights.data ? (
            <InsightsHero parentName={parent.displayName} lastReceiptAt={parent.lastReceiptAt} insights={insights.data} days={days} onDays={setDays} lang={myLang} />
          ) : (
            <div className="hero-surface h-72 animate-pulse rounded-[24px]" />
          )}

          <div className="grid gap-5 lg:grid-cols-12">
            <section aria-labelledby="alerts-heading" className="lg:col-span-7">
              <h2 id="alerts-heading" lang={lang} className="mb-3 text-lg font-semibold">
                {t("home.openAlerts")}
              </h2>
              {data.openAlerts.length === 0 ? (
                <p lang={lang} className="sticker flex items-center gap-3 bg-surface px-5 py-4 text-[16px] font-medium text-taken">
                  <span className="grid size-9 place-items-center rounded-full bg-taken-tint">
                    <BellRing aria-hidden className="size-4.5" />
                  </span>
                  {t("home.allCalm")}
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
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
                </div>
              )}
            </section>
            <div className="lg:col-span-5">
              <h2 lang={lang} className="mb-3 text-lg font-semibold">
                {t("dash.today")}
              </h2>
              <TodayCard parent={parent} fid={fid} myLang={myLang} />
            </div>
          </div>

          {insights.data && <InsightsGrid insights={insights.data} lang={myLang} />}
        </div>
      )}
    </FamilyShell>
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
  return (
    <section className="sticker overflow-hidden bg-surface">
      {parent.paused && (
        <p lang={lang} className="flex items-center gap-2 border-b border-line bg-offline-tint px-4 py-2.5 font-medium text-offline">
          <CirclePause aria-hidden className="size-5" /> {t("home.paused")}
        </p>
      )}
      {parent.slots.length === 0 ? (
        <p lang={lang} className="p-5 text-[15px] text-muted">
          {t("home.noMedicines")}
        </p>
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
      <nav className="grid grid-cols-2 gap-2 border-t border-line bg-paper/60 p-3">
        {[
          { to: `${base}/medicines`, icon: Pill, label: t("action.medicines") },
          { to: `${base}/checks`, icon: Activity, label: t("action.checks") },
          { to: `${base}/report`, icon: FileText, label: t("action.report") },
          { to: `${base}/settings`, icon: Settings, label: t("action.settings") },
          { to: "/people", icon: Users, label: t("action.people") },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 text-[14.5px] font-semibold ring-1 ring-line hover:ring-line-strong">
            <Icon aria-hidden className="size-4.5 text-indigo-soft dark:text-ink" strokeWidth={2.25} />
            <span lang={lang}>{label}</span>
          </Link>
        ))}
        <button type="button" onClick={sendTest} disabled={testState !== "idle"} className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 text-[14.5px] font-semibold ring-1 ring-line hover:ring-line-strong disabled:opacity-60">
          <BellRing aria-hidden className="size-4.5 text-indigo-soft dark:text-ink" strokeWidth={2.25} />
          <span lang={lang}>{t("action.testReminder")}</span>
        </button>
        {testState !== "idle" && (
          <p lang={lang} role="status" className="col-span-2 px-1 text-[13.5px] text-muted">
            {testState === "sent" ? t("action.testSent") : t("action.testLimit")}
          </p>
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
