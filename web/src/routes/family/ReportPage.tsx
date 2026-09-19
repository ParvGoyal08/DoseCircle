import type { LanguageCode, ReportOutcome } from "@dosecircle/shared";
import { Printer } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { FamilyShell } from "../../components/FamilyShell";
import { LanguageToggle } from "../../components/LanguagePicker";
import { Button } from "../../components/ui";
import { OutcomeLegend, OutcomeMark } from "../../components/WeekStrip";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { formatDay, formatNumber } from "../../lib/format";
import type { Report } from "../../lib/types";
import { useApi } from "../../lib/useApi";

export function ReportPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <ReportView fid={me.fid} pid={pid} myLang={me.lang} />}</RequireFamily>;
}

const stampTime = (hhmm: string) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
const stampDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/**
 * One printable page for the doctor. English by default (what doctors commonly read), switchable.
 * An offline phone is "unknown", never "missed", and does not count against adherence.
 */
function ReportView({ fid, pid, myLang }: { fid: string; pid: string; myLang: string }) {
  const [reportLang, setReportLang] = useState<LanguageCode>("en");
  const { t, lang } = useT(reportLang);
  const ui = useT(myLang);
  const report = useApi(() => api<Report>(`/families/${fid}/parents/${pid}/report`, { auth: "family" }), [fid, pid]);
  const data = report.data;

  const days = data ? Object.keys(data.report.grid).sort() : [];
  const times = data ? [...new Set(days.flatMap((day) => Object.keys(data.report.grid[day]!)))].sort() : [];

  return (
    <FamilyShell
      lang={myLang}
      back="/home"
      wide
      actions={
        <Button tone="ink" onClick={() => window.print()}>
          <Printer aria-hidden className="size-5" />
          <span lang={ui.lang}>{ui.t("report.print")}</span>
        </Button>
      }
    >
      <details className="no-print mb-5 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <summary lang={ui.lang} className="cursor-pointer font-semibold">
          {ui.t("report.language")}
        </summary>
        <div className="mt-3">
          <LanguageToggle value={reportLang} onChange={setReportLang} lang={ui.lang} />
        </div>
      </details>

      {data && (
        <article lang={lang} className="mx-auto max-w-[800px] rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">{t("report.title")}</p>
              <h1 className="mt-1 text-3xl font-semibold">{data.parent.displayName}</h1>
              <p className="tabular mt-1 text-[15px]">
                {formatDay(data.from, lang, { day: "numeric", month: "short", year: "numeric" })} – {formatDay(data.to, lang, { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <p className="max-w-xs text-[13px] text-muted sm:text-right">
              {t("report.subtitle")}
              <br />
              <span className="tabular">{formatDay(data.generatedAt, lang, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </p>
          </header>

          {/* Six columns do not fit a phone at any readable size. The table scrolls inside its own
              box rather than pushing the whole page sideways; on paper it has the full width. */}
          <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:overflow-visible">
          <table className="w-full min-w-[520px] border-collapse text-left text-[15px] print:min-w-0">
            <thead>
              <tr className="border-b border-ink/60 text-[13px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-semibold" />
                <th className="tabular px-2 py-2 text-right font-semibold">{t("report.adherence")}</th>
                <th className="tabular px-2 py-2 text-right font-semibold">{t("report.onTime")}</th>
                <th className="tabular px-2 py-2 text-right font-semibold">{t("report.late")}</th>
                <th className="tabular px-2 py-2 text-right font-semibold">{t("report.missed")}</th>
                <th className="tabular py-2 pl-2 text-right font-semibold">{t("report.unknown")}</th>
              </tr>
            </thead>
            <tbody>
              {data.report.rows.map((row) => (
                <tr key={row.medId} className="border-b border-line">
                  <td className="py-2.5 pr-2">
                    <span lang="en" className="medicine-name font-semibold">
                      {row.nameAsPrinted}
                    </span>{" "}
                    {row.strength && <span className="text-muted">{row.strength}</span>}
                  </td>
                  <td className="tabular px-2 py-2.5 text-right text-lg font-semibold">{row.adherence === null ? "–" : formatNumber(row.adherence, lang, { style: "percent" })}</td>
                  <td className="tabular px-2 py-2.5 text-right">{formatNumber(row.onTime, lang)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{formatNumber(row.late, lang)}</td>
                  <td className="tabular px-2 py-2.5 text-right">{formatNumber(row.missed, lang)}</td>
                  <td className="tabular py-2.5 pl-2 text-right">{formatNumber(row.unknown, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <section className="mt-8 break-inside-avoid">
            <h2 className="mb-3 text-lg font-semibold">{t("report.grid")}</h2>
            <div className="overflow-x-auto">
              <table className="border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th />
                    {days.map((day) => (
                      <th key={day} className="tabular px-1.5 pb-1 text-center font-semibold text-muted">
                        {formatDay(stampDate(day), lang, { weekday: "short", day: "numeric" })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {times.map((time) => (
                    <tr key={time}>
                      <th className="tabular pr-3 text-right font-semibold text-muted">{stampTime(time)}</th>
                      {days.map((day) => {
                        const outcome = data.report.grid[day]![time] as ReportOutcome | undefined;
                        return (
                          <td key={day} className="border border-line px-1.5 py-1.5 text-center">
                            {outcome ? <OutcomeMark outcome={outcome} size={16} /> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2">
              <OutcomeLegend t={t} lang={lang} />
            </div>
          </section>

          <section className="mt-8 break-inside-avoid">
            <h2 className="mb-2 text-lg font-semibold">{t("report.misses")}</h2>
            {data.report.misses.length === 0 ? (
              <p className="text-muted">{t("report.none")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.report.misses.map((miss) => (
                  <li key={miss.doseStamp} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <OutcomeMark outcome={miss.outcome} />
                    <span className="tabular w-40 font-semibold">
                      {formatDay(stampDate(miss.doseStamp.slice(0, 8)), lang, { weekday: "short", day: "numeric", month: "short" })} · {stampTime(miss.doseStamp.slice(8))}
                    </span>
                    <span className="text-muted">{t(`outcome.${miss.outcome}`)}</span>
                    <span lang="en" className="medicine-name">
                      {miss.medicineNames.join(", ")}
                    </span>
                    {miss.handledBy && (
                      <span className="ml-auto text-[14px]">
                        {t("report.handledBy")}: <span className="font-semibold">{miss.handledBy}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.readings.some((series) => series.points.length > 0) && (
            <section className="mt-8 break-inside-avoid">
              <h2 className="mb-2 text-lg font-semibold">{t("checks.readings")}</h2>
              {/* Every reading, in order, with no verdict attached. The doctor reads the numbers. */}
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-ink/60 text-[13px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-2 font-semibold">{t("report.grid")}</th>
                    {data.readings
                      .filter((series) => series.points.length > 0)
                      .map((series) => (
                        <th key={series.checkId} className="px-2 py-2 text-right font-semibold">
                          {t(`check.${series.type}`)}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(data.readings.flatMap((series) => series.points.map((p) => p.date)))]
                    .sort()
                    .map((date) => (
                      <tr key={date} className="border-b border-line">
                        <td className="tabular py-2 pr-2 font-semibold">{formatDay(date, lang, { weekday: "short", day: "numeric", month: "short" })}</td>
                        {data.readings
                          .filter((series) => series.points.length > 0)
                          .map((series) => {
                            const point = series.points.find((p) => p.date === date);
                            return (
                              <td key={series.checkId} lang="en" className="tabular px-2 py-2 text-right">
                                {point?.text ?? "–"}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-2 text-[13px] text-muted">{t("checks.notAdvice")}</p>
            </section>
          )}

          <footer className="mt-8 border-t border-line pt-3 text-[13px] text-muted">{t("app.notMedicalAdvice")}</footer>
        </article>
      )}
    </FamilyShell>
  );
}

