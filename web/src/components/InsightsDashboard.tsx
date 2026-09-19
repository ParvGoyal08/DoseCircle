import { SLOT_NAMES, type ReportOutcome, type SlotName } from "@dosecircle/shared";
import { ArrowDownRight, ArrowUpRight, Clock, Flame, Lightbulb, Pill, Smartphone, TrendingDown, TrendingUp, TriangleAlert, WifiOff, Zap, type LucideIcon } from "lucide-react";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { formatAgo, formatDay, formatNumber } from "../lib/format";
import type { Highlight, Insights } from "../lib/types";
import { CalendarHeatmap, DaysLeftGauge, rollingAdherence, Columns, OutcomeBar, ReachStrip, ReadingTrend, ShareBars, Swatch, TimingScatter, TrendArea, WeekdayHeatmap, type ReadingLine } from "./charts/Charts";
import { Avatar, cx } from "./ui";

export function Panel({ title, subtitle, action, children, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("sticker flex flex-col bg-surface p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13.5px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ t, lang }: { t: TFunction; lang: string }) {
  return (
    <p lang={lang} className="grid h-full min-h-24 place-items-center text-[14px] text-muted">
      {t("dash.noData")}
    </p>
  );
}

const HIGHLIGHT_LOOK: Record<Highlight["code"], { icon: LucideIcon; tone: string }> = {
  improving: { icon: TrendingUp, tone: "bg-taken-tint text-taken" },
  declining: { icon: TrendingDown, tone: "bg-missed-tint text-missed" },
  strong_week: { icon: Flame, tone: "bg-taken-tint text-taken" },
  slot_slipping: { icon: TriangleAlert, tone: "bg-due-tint text-due" },
  irregular_timing: { icon: Clock, tone: "bg-due-tint text-due" },
  refill_soon: { icon: Pill, tone: "bg-critical-tint text-critical" },
  phone_offline_often: { icon: WifiOff, tone: "bg-offline-tint text-offline" },
};

function highlightText(h: Highlight, t: TFunction): string {
  return h.code === "slot_slipping" ? t(`insight.slot_slipping.${h.slotName}`) : t(`insight.${h.code}`);
}

export interface InsightsHeroProps {
  parentName: string;
  lastReceiptAt: string | null;
  insights: Insights;
  days: 7 | 30;
  onDays: (days: 7 | 30) => void;
  lang: string;
  badge?: ReactNode;
}

/** The ink-blue band: the four numbers a family checks first, over the daily trend. */
export function InsightsHero({ parentName, lastReceiptAt, insights, days, onDays, lang: viewerLang, badge }: InsightsHeroProps) {
  const { t, lang } = useT(viewerLang);
  const h = insights.headline;
  const delta = h.adherence !== null && h.previousAdherence !== null ? h.adherence - h.previousAdherence : null;
  const response = insights.responders.map((r) => r.medianMinutesToClaim).filter((m): m is number => m !== null);
  const typicalResponse = response.length ? Math.round(response.reduce((a, b) => a + b, 0) / response.length) : null;
  const nextRefill = insights.refills[0];

  return (
    <section className="hero-surface relative overflow-hidden rounded-[24px]">
      <div aria-hidden className="hero-grid absolute inset-0" />
      <div className="relative p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={parentName} size={44} className="!bg-white/12 !text-white ring-1 ring-white/25" />
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{parentName}</h2>
            <p className="flex items-center gap-1.5 text-[14px] text-hero-muted">
              <Smartphone aria-hidden className="size-4" />
              {lastReceiptAt ? (
                <>
                  <span lang={lang}>{t("home.lastReachable")}</span>
                  <span className="tabular font-semibold text-white">{formatAgo(lastReceiptAt, lang)}</span>
                </>
              ) : (
                <span lang={lang}>{t("home.neverReachable")}</span>
              )}
            </p>
          </div>
          {badge}
          <div role="radiogroup" className="ml-auto flex rounded-full bg-white/10 p-1 ring-1 ring-white/15">
            {([7, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => onDays(d)}
                className={cx("min-h-9 rounded-full px-4 text-[14px] font-semibold transition-colors", days === d ? "bg-haldi text-[#172b2a]" : "text-white hover:bg-white/10")}
              >
                <span lang={lang}>{t(`dash.range.${d}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <p lang={lang} className="text-[14px] font-medium text-hero-muted">
              {t("dash.adherence")}
            </p>
            <div className="mt-1 flex items-end gap-3">
              <span className="tabular text-[72px] font-semibold leading-none tracking-tight text-white md:text-[88px]">{h.adherence === null ? "–" : formatNumber(h.adherence, lang, { style: "percent" })}</span>
              {delta !== null && Math.abs(delta) >= 0.005 && (
                <span className={cx("mb-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold", delta > 0 ? "bg-[#4ade9a]/15 text-[#4ade9a]" : "bg-[#ff8a80]/15 text-[#ff8a80]")}>
                  {delta > 0 ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
                  <span className="tabular">{formatNumber(Math.abs(delta), lang, { style: "percent" })}</span>
                  <span lang={lang} className="font-medium opacity-90">
                    {t("dash.vsPrevious")}
                  </span>
                </span>
              )}
            </div>
            <p lang={lang} className="mt-2 max-w-sm text-[13.5px] text-hero-muted">
              {t("dash.adherenceHint")}
            </p>
          </div>

          {/* One per row on a phone. Two across left each caption about 110px, and three cards in two
              columns left the last one alone on its row. */}
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
            <Kpi icon={Flame} label={t("dash.streak")} lang={lang} value={formatNumber(h.currentStreak, lang)} foot={`${t("dash.bestStreak")} · ${formatNumber(h.bestStreak, lang)}`} />
            <Kpi icon={Zap} label={t("dash.response")} lang={lang} value={typicalResponse === null ? "–" : formatNumber(typicalResponse, lang, { style: "unit", unit: "minute", unitDisplay: "short" })} foot={t("dash.responseHint")} />
            <Kpi
              icon={Pill}
              label={t("dash.nextRefill")}
              lang={lang}
              value={nextRefill ? formatNumber(nextRefill.daysLeft, lang, { style: "unit", unit: "day", unitDisplay: "long" }) : "–"}
              foot={nextRefill ? <span className="medicine-name">{nextRefill.nameAsPrinted}</span> : t("dash.noRefill")}
              accent={nextRefill !== undefined && nextRefill.daysLeft <= nextRefill.thresholdDays}
            />
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-1 flex items-center justify-between text-[13px] text-hero-muted">
            <span lang={lang}>{t("dash.trend")}</span>
            <span className="tabular">
              {formatDay(insights.range.from, lang, { day: "numeric", month: "short" })} – {formatDay(insights.range.to, lang, { day: "numeric", month: "short" })}
            </span>
          </div>
          <TrendArea values={rollingAdherence(insights.daily)} tone="dark" height={104} />
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, foot, lang, accent = false }: { icon: LucideIcon; label: string; value: ReactNode; foot: ReactNode; lang: string; accent?: boolean }) {
  return (
    <div className={cx("glass-card p-4", accent && "!border-haldi/60 !bg-haldi/15")}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-hero-muted">
        <Icon aria-hidden className={cx("size-4", accent ? "text-haldi" : "text-hero-muted")} />
        <span lang={lang}>{label}</span>
      </p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p lang={lang} className="mt-1 line-clamp-2 text-[13.5px] text-hero-muted">
        {foot}
      </p>
    </div>
  );
}

/** The analytics grid under the hero. Every chart repeats the same outcome colours. */
export function InsightsGrid({ insights, lang: viewerLang }: { insights: Insights; lang: string }) {
  const { t, lang } = useT(viewerLang);
  const h = insights.headline;
  const outcomeLabel = (o: ReportOutcome) => t(`outcome.${o}`);
  const dates = insights.daily.map((d) => d.date);
  const slots = SLOT_NAMES.filter((s) => insights.weekdaySlots.some((c) => c.slotName === s));
  const weekdayLabels = Array.from({ length: 7 }, (_, d) => new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + d))));
  const totalResolved = insights.escalation.doses;
  const escalationRows = [
    { key: "on_time", label: t("dash.parentOnTime"), count: insights.escalation.parentOnTime, fill: "var(--color-taken-fill)" },
    { key: "late", label: t("dash.parentLate"), count: insights.escalation.parentLate, fill: "var(--color-haldi)" },
    ...insights.escalation.claimedBy.map((c) => ({ key: c.mid, label: c.displayName, count: c.count, fill: "var(--color-claimed-fill)" })),
    { key: "unresolved", label: t("dash.unresolved"), count: insights.escalation.unresolved, fill: "var(--color-missed-fill)" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {insights.highlights.length > 0 && (
        <Panel title={<span lang={lang}>{t("dash.highlights")}</span>} className="lg:col-span-12">
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.highlights.map((highlight, i) => {
              const look = HIGHLIGHT_LOOK[highlight.code];
              return (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3">
                  <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", look.tone)}>
                    <look.icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="min-w-0 pt-1">
                    <span lang={lang} className="block text-[14.5px] font-medium leading-snug text-ink">
                      {highlightText(highlight, t)}
                    </span>
                    {highlight.code === "refill_soon" && <span className="medicine-name mt-1 inline-block rounded-md bg-sunken px-1.5 py-0.5 text-[13px] font-semibold">{highlight.nameAsPrinted}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title={<span lang={lang}>{t("dash.outcomes")}</span>} className="lg:col-span-5">
        <OutcomeBar counts={{ on_time: h.onTime, late: h.late, missed: h.missed, unknown: h.unknown }} labels={{ on_time: outcomeLabel("on_time"), late: outcomeLabel("late"), missed: outcomeLabel("missed"), unknown: outcomeLabel("unknown") }} lang={lang} />
      </Panel>

      <Panel
        title={<span lang={lang}>{t("dash.calendar")}</span>}
        className="lg:col-span-7"
        action={
          <span className="hidden flex-wrap gap-3 text-[13.5px] text-muted sm:flex">
            {(["on_time", "late", "missed", "unknown"] as const).map((o) => (
              <span key={o} className="inline-flex items-center gap-1.5">
                <Swatch outcome={o} />
                <span lang={lang}>{outcomeLabel(o)}</span>
              </span>
            ))}
          </span>
        }
      >
        {insights.calendar.times.length ? <CalendarHeatmap days={insights.calendar.days} times={insights.calendar.times} lang={lang} outcomeLabel={outcomeLabel} /> : <Empty t={t} lang={lang} />}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.timing")}</span>} className="lg:col-span-8">
        {insights.timing.length ? <TimingScatter points={insights.timing} dates={dates} lang={lang} windowLabel={t("dash.timingWindow")} /> : <Empty t={t} lang={lang} />}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.consistency")}</span>} subtitle={<span lang={lang}>{t("dash.consistencyHelp")}</span>} className="lg:col-span-4">
        {insights.consistency.steady === null ? (
          <Empty t={t} lang={lang} />
        ) : (
          <div className="flex h-full flex-col justify-between gap-4">
            <p className={cx("inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-semibold", insights.consistency.steady ? "bg-taken-tint text-taken" : "bg-due-tint text-due")}>
              {insights.consistency.steady ? <Clock aria-hidden className="size-4" /> : <TriangleAlert aria-hidden className="size-4" />}
              <span lang={lang}>{insights.consistency.steady ? t("dash.steady") : t("dash.irregular")}</span>
            </p>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-paper p-3">
                <dt lang={lang} className="text-[13px] text-muted">
                  {t("dash.medianDelay")}
                </dt>
                <dd className="tabular mt-1 text-2xl font-semibold">{formatNumber(insights.consistency.medianDelayMinutes ?? 0, lang, { style: "unit", unit: "minute", unitDisplay: "short" })}</dd>
              </div>
              <div className="rounded-xl bg-paper p-3">
                <dt lang={lang} className="text-[13px] text-muted">
                  {t("dash.spread")}
                </dt>
                <dd className="tabular mt-1 text-2xl font-semibold">
                  ±{formatNumber(Math.round((insights.consistency.spreadMinutes ?? 0) / 2), lang, { style: "unit", unit: "minute", unitDisplay: "short" })}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.weekday")}</span>} className="lg:col-span-6">
        {slots.length ? <WeekdayHeatmap cells={insights.weekdaySlots} slots={slots} weekdayLabels={weekdayLabels} slotLabel={(s) => t(`slot.${s as SlotName}`)} /> : <Empty t={t} lang={lang} />}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.medicines")}</span>} className="lg:col-span-6">
        {insights.medicines.length ? (
          <ShareBars
            lang={lang}
            rows={insights.medicines.map((m) => ({
              key: m.medId,
              label: (
                <span className="medicine-name">
                  {m.nameAsPrinted} {m.strength && <span className="font-normal text-muted">{m.strength}</span>}
                </span>
              ),
              value: m.adherence,
              detail: (
                <span className="flex flex-wrap gap-x-3">
                  {(["on_time", "late", "missed", "unknown"] as const).map((o) => (
                    <span key={o} className="inline-flex items-center gap-1">
                      <Swatch outcome={o} />
                      <span className="tabular">{formatNumber(o === "on_time" ? m.onTime : o === "late" ? m.late : o === "missed" ? m.missed : m.unknown, lang)}</span>
                    </span>
                  ))}
                </span>
              ),
            }))}
          />
        ) : (
          <Empty t={t} lang={lang} />
        )}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.escalation")}</span>} className="lg:col-span-6">
        {totalResolved ? (
          <div>
            <div className="flex h-4 overflow-hidden rounded-full bg-sunken" aria-hidden>
              {escalationRows.map((row) => (row.count ? <span key={row.key} style={{ width: `${(row.count / totalResolved) * 100}%`, background: row.fill }} /> : null))}
            </div>
            <ul className="mt-4 divide-y divide-line">
              {escalationRows.map((row) => (
                <li key={row.key} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="size-3 rounded-full" style={{ background: row.fill }} />
                  <span lang={lang} className="flex-1 text-[15px] font-medium">
                    {row.label}
                  </span>
                  <span className="tabular text-[15px] font-semibold">{formatNumber(row.count, lang)}</span>
                  <span className="tabular w-12 text-right text-[13px] text-muted">{formatNumber(row.count / totalResolved, lang, { style: "percent" })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Empty t={t} lang={lang} />
        )}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.responders")}</span>} className="lg:col-span-6">
        <ul className="space-y-3">
          {insights.responders.map((r) => {
            const maxAlerted = Math.max(1, ...insights.responders.map((x) => x.alerted));
            return (
              <li key={r.mid} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-3">
                  <span className="tabular grid size-6 place-items-center rounded-full bg-indigo text-[12px] font-semibold text-white">{r.position}</span>
                  <Avatar name={r.displayName} size={34} />
                  <span className="flex-1 font-semibold">{r.displayName}</span>
                  <span className="tabular text-[14px] text-muted">
                    <Zap aria-hidden className="mr-1 inline size-3.5 text-haldi-deep" />
                    {r.medianMinutesToClaim === null ? "–" : formatNumber(r.medianMinutesToClaim, lang, { style: "unit", unit: "minute", unitDisplay: "short" })}
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-[13px]">
                  <span lang={lang} className="text-muted">
                    {t("dash.alerted")}
                  </span>
                  <span className="h-2 rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-indigo-soft/40" style={{ width: `${(r.alerted / maxAlerted) * 100}%` }} />
                  </span>
                  <span className="tabular font-semibold">{formatNumber(r.alerted, lang)}</span>
                  <span lang={lang} className="text-muted">
                    {t("dash.handled")}
                  </span>
                  <span className="h-2 rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-claimed-fill" style={{ width: `${(r.claims / maxAlerted) * 100}%` }} />
                  </span>
                  <span className="tabular font-semibold">{formatNumber(r.claims, lang)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.delays")}</span>} subtitle={<span lang={lang}>{t("dash.minutes")}</span>} className="lg:col-span-4">
        <Columns
          lang={lang}
          bars={insights.delays.map((b) => ({
            label: b.bucket === "early" ? t("dash.bucket.early") : b.bucket,
            value: b.count,
            tone: b.bucket === "31-60" || b.bucket === "60+" ? "var(--color-haldi)" : "var(--color-taken-fill)",
          }))}
        />
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.refills")}</span>} className="lg:col-span-4">
        {insights.refills.length ? (
          <ul className="space-y-4">
            {insights.refills.slice(0, 3).map((r) => (
              <li key={r.medId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="medicine-name truncate text-[15px] font-semibold">{r.nameAsPrinted}</span>
                  <span className={cx("tabular text-[15px] font-semibold", r.daysLeft <= r.thresholdDays ? "text-missed" : "text-ink")}>{formatNumber(r.daysLeft, lang, { style: "unit", unit: "day", unitDisplay: "short" })}</span>
                </div>
                <DaysLeftGauge daysLeft={r.daysLeft} thresholdDays={r.thresholdDays} />
                <p className="mt-1.5 text-[13.5px] text-muted">
                  <span lang={lang}>{t("dash.runsOut")}</span> · <span className="tabular">{formatDay(r.runOutDate, lang, { weekday: "short", day: "numeric", month: "short" })}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} lang={lang} />
        )}
      </Panel>

      <Panel title={<span lang={lang}>{t("dash.reach")}</span>} subtitle={<span lang={lang}>{t("dash.reachHelp")}</span>} className="lg:col-span-4">
        <ReachStrip days={insights.reachability} lang={lang} />
        <p className="tabular mt-3 text-3xl font-semibold">
          {formatNumber(
            insights.reachability.reduce((s, d) => s + d.reached, 0) / Math.max(1, insights.reachability.reduce((s, d) => s + d.reminders, 0)),
            lang,
            { style: "percent" },
          )}
        </p>
      </Panel>

      {insights.readings.map((series) => (
        <ReadingPanel key={series.checkId} series={series} dates={dates} t={t} lang={lang} />
      ))}

      {insights.readings.length > 0 && (
        <p lang={lang} className="lg:col-span-12 text-[13px] text-muted">
          {t("checks.notAdvice")}
        </p>
      )}
    </div>
  );
}

/** Two series at most per check, so blood pressure reads as one pair of lines rather than two panels. */
const READING_STROKES = ["var(--color-indigo-soft)", "var(--color-haldi-deep)"];

function ReadingPanel({ series, dates, t, lang }: { series: Insights["readings"][number]; dates: string[]; t: TFunction; lang: string }) {
  const byDate = new Map(series.points.map((p) => [p.date, p]));
  const keys = [series.chart.primary, series.chart.secondary].filter((k): k is string => Boolean(k));
  const lines: ReadingLine[] = keys.map((key, index) => ({
    key,
    label: t(`field.${key}`),
    values: dates.map((date) => byDate.get(date)?.values[key] ?? null),
    stroke: READING_STROKES[index] ?? READING_STROKES[0]!,
  }));
  const unit = series.fields.find((f) => f.key === series.chart.primary)?.unit ?? "";

  return (
    <Panel
      title={<span lang={lang}>{t(`check.${series.type}`)}</span>}
      subtitle={
        <span>
          <span lang={lang}>{t("checks.writtenDown")}</span> <span className="tabular font-semibold text-ink">{formatNumber(series.recordedDays, lang)}</span>
          <span aria-hidden> / </span>
          <span className="tabular">{formatNumber(series.askedDays, lang)}</span>
          {!series.escalates && (
            <>
              {" · "}
              <span lang={lang}>{t("checks.quiet")}</span>
            </>
          )}
        </span>
      }
      className="lg:col-span-6"
      action={
        series.latest && (
          <span className="shrink-0 text-right">
            <span lang={lang} className="block text-[13.5px] text-muted">
              {t("checks.latest")}
            </span>
            <span lang="en" className="tabular text-[19px] font-semibold text-ink">
              {series.latest.text}
            </span>
          </span>
        )
      }
    >
      {series.points.length === 0 ? (
        <p lang={lang} className="grid h-full min-h-24 place-items-center text-[14px] text-muted">
          {t("checks.noReadings")}
        </p>
      ) : (
        <>
          <ReadingTrend lines={lines} dates={dates} lang={lang} />
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {(["lowest", "middle", "highest"] as const).map((which) => {
              const spread = series.spread.find((s) => s.key === series.chart.primary);
              return (
                <div key={which} className="rounded-xl bg-paper p-2.5">
                  <dt lang={lang} className="text-[13.5px] text-muted">
                    {t(`checks.${which}`)}
                  </dt>
                  <dd className="tabular mt-0.5 text-[17px] font-semibold">
                    {spread ? formatNumber(spread[which], lang) : "–"}
                    <span lang="en" className="ml-1 text-[13.5px] font-medium text-muted">
                      {unit}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </Panel>
  );
}
