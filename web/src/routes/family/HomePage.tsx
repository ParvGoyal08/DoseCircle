import type { SlotName } from "@dosecircle/shared";
import { BellRing, ChevronRight, CirclePause, FileText, Loader2, Pill, Settings, Smartphone, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FamilyAlert } from "../../components/FamilyAlert";
import { FamilyShell } from "../../components/FamilyShell";
import { Timeline } from "../../components/Timeline";
import { OutcomeLegend, WeekStrip } from "../../components/WeekStrip";
import { Avatar, Button, Card, cx, SLOT_ICONS, StatusPill } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { formatAgo, formatNumber, formatTime } from "../../lib/format";
import type { Dashboard, ParentCard, Timeline as TimelineData } from "../../lib/types";
import { useApi } from "../../lib/useApi";
import { EnableMyAlerts } from "./AuthPages";

export function HomePage() {
  return <RequireFamily>{(me) => <Home fid={me.fid} lang={me.lang} mid={me.mid} />}</RequireFamily>;
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

function Home({ fid, lang: myLang, mid }: { fid: string; lang: string; mid: string }) {
  const navigate = useNavigate();
  const { t, lang } = useT(myLang);
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid], 30_000);
  const data = dashboard.data;

  return (
    <FamilyShell lang={myLang}>
      {!data ? (
        <div className="grid place-items-center py-24">
          <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-8">
          <EnableMyAlerts lang={myLang} />

          <section aria-labelledby="alerts-heading">
            <h2 id="alerts-heading" lang={lang} className="font-display mb-4 text-4xl">
              {t("home.openAlerts")}
            </h2>
            {data.openAlerts.length === 0 ? (
              <p lang={lang} className="sticker flex items-center gap-3 bg-mint-tint px-5 py-4 text-lg font-bold text-taken">
                <BellRing aria-hidden className="size-5" strokeWidth={2.25} />
                {t("home.allCalm")}
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {data.openAlerts.map((alert) => {
                  const parent = data.parents.find((p) => p.pid === alert.pid);
                  return (
                    <FamilyAlert
                      key={alert.doseId}
                      alert={alert}
                      viewerLang={myLang}
                      viewerMid={mid}
                      ladder={parent?.ladder ?? []}
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

          {data.parents.map((parent) => (
            <ParentSummary key={parent.pid} parent={parent} fid={fid} myLang={myLang} />
          ))}
        </div>
      )}
    </FamilyShell>
  );
}

const SLOT_ORDER: SlotName[] = ["morning", "afternoon", "evening", "night"];

function ParentSummary({ parent, fid, myLang }: { parent: ParentCard; fid: string; myLang: string }) {
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
    <section aria-label={parent.displayName}>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-ink bg-marigold-tint p-4">
          <Avatar name={parent.displayName} size={56} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-4xl">{parent.displayName}</h2>
            <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
              <Smartphone aria-hidden className="size-4" />
              {parent.lastReceiptAt ? (
                <>
                  <span lang={lang}>{t("home.lastReachable")}</span>
                  <span className="tabular font-semibold text-ink">{formatAgo(parent.lastReceiptAt, lang)}</span>
                </>
              ) : (
                <span lang={lang}>{t("home.neverReachable")}</span>
              )}
            </p>
          </div>
          {parent.myLadderPosition !== null ? (
            <div className="flex items-center gap-2 rounded-full border-2 border-ink bg-surface py-1 pl-1 pr-3 shadow-[2px_2px_0_var(--color-ink)]" title={t("home.yourPosition")}>
              <span className="tabular grid size-9 place-items-center rounded-full bg-ink text-[17px] font-extrabold text-haldi">{formatNumber(parent.myLadderPosition, lang)}</span>
              <span lang={lang} className="max-w-36 text-[13px] leading-tight text-muted">
                {t("home.yourPosition")}
              </span>
            </div>
          ) : (
            <span lang={lang} className="text-[13px] text-muted">
              {t("home.notInOrder")}
            </span>
          )}
        </div>

        {parent.paused && (
          <p lang={lang} className="flex items-center gap-2 border-b border-line bg-offline-tint px-4 py-2.5 font-medium text-offline">
            <CirclePause aria-hidden className="size-5" /> {t("home.paused")}
          </p>
        )}

        <div className="grid gap-6 p-4 md:grid-cols-2">
          <div>
            <h3 lang={lang} className="mb-2 text-[15px] font-semibold">
              {t("home.today")}
            </h3>
            {parent.slots.length === 0 ? (
              <p lang={lang} className="text-[15px] text-muted">
                {t("home.noMedicines")}
              </p>
            ) : (
              <ul className="divide-y-2 divide-ink/15 overflow-hidden rounded-xl border-2 border-ink">
                {[...parent.slots]
                  .sort((a, b) => SLOT_ORDER.indexOf(a.slotName) - SLOT_ORDER.indexOf(b.slotName))
                  .map((slot) => {
                    const dose = parent.today.find((d) => d.slotName === slot.slotName);
                    const Icon = SLOT_ICONS[slot.slotName];
                    return (
                      <li key={slot.slotName} className="flex items-center gap-3 px-3 py-2.5">
                        <Icon aria-hidden className="size-5 text-muted" strokeWidth={2.25} />
                        <span lang={lang} className="font-semibold">
                          {t(`slot.${slot.slotName}`)}
                        </span>
                        <span className="tabular text-[15px] text-muted">{`${slot.compactTime.slice(0, 2)}:${slot.compactTime.slice(2)}`}</span>
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
          </div>
          <div>
            <h3 lang={lang} className="mb-2 text-[15px] font-semibold">
              {t("home.week")}
            </h3>
            <WeekStrip week={parent.week} t={t} lang={lang} />
            <div className="mt-2">
              <OutcomeLegend t={t} lang={lang} />
            </div>
            {parent.refills.some((r) => r.level !== "ok") && (
              <div className="mt-4">
                <h3 lang={lang} className="mb-2 text-[15px] font-semibold">
                  {t("home.refills")}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {parent.refills
                    .filter((r) => r.level !== "ok")
                    .map((r) => (
                      <li key={r.medId} className={cx("inline-flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1.5 text-[14px] font-bold", r.level === "critical" ? "bg-missed-tint text-missed" : r.level === "recount" ? "bg-offline-tint text-offline" : "bg-due-tint text-due")}>
                        <Pill aria-hidden className="size-4" strokeWidth={2.25} />
                        <span lang="en" className="medicine-name">
                          {r.nameAsPrinted}
                        </span>
                        {r.level === "recount" ? (
                          <span lang={lang}>{t("refill.recount")}</span>
                        ) : (
                          r.daysLeft !== null && <span className="tabular">{formatNumber(r.daysLeft, lang, { style: "unit", unit: "day", unitDisplay: "long" })}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap gap-2 border-t-2 border-ink bg-haldi-tint/60 p-3">
          {[
            { to: `${base}/medicines`, icon: Pill, label: t("action.medicines") },
            { to: `${base}/report`, icon: FileText, label: t("action.report") },
            { to: `${base}/settings`, icon: Settings, label: t("action.settings") },
          ].map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className="pressable inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-surface px-3.5 text-[15px] font-bold shadow-[2px_2px_0_var(--color-ink)]">
              <Icon aria-hidden className="size-4.5" strokeWidth={2.25} />
              <span lang={lang}>{label}</span>
            </Link>
          ))}
          <Button tone="quiet" size="sm" className="min-h-11 rounded-full" onClick={sendTest} disabled={testState !== "idle"}>
            <BellRing aria-hidden className="size-4.5" strokeWidth={2.25} />
            <span lang={lang}>{t("action.testReminder")}</span>
          </Button>
          {testState !== "idle" && (
            <p lang={lang} role="status" className="w-full px-1 text-[14px] text-muted">
              {testState === "sent" ? t("action.testSent") : t("action.testLimit")}
            </p>
          )}
        </nav>
      </Card>
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
