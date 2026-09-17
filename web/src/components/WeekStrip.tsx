import type { ReportOutcome } from "@dosecircle/shared";
import type { TFunction } from "i18next";
import { formatDay } from "../lib/format";
import { cx } from "./ui";

/** Each outcome has its own shape as well as colour, so the strip reads in greyscale and for colour-blind viewers. */
export function OutcomeMark({ outcome, size = 14 }: { outcome: ReportOutcome; size?: number }) {
  const s = size;
  switch (outcome) {
    case "on_time":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="6" fill="var(--color-taken)" />
        </svg>
      );
    case "late":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="5.25" fill="none" stroke="var(--color-taken)" strokeWidth="2.5" />
        </svg>
      );
    case "missed":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
          <path d="M3 3 L11 11 M11 3 L3 11" stroke="var(--color-missed)" strokeWidth="2.75" strokeLinecap="round" />
        </svg>
      );
    case "unknown":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
          <rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke="var(--color-offline)" strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      );
    case "open":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
          <path d="M7 1.5 L12.5 12 H1.5 Z" fill="var(--color-due)" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" aria-hidden>
          <path d="M3 7 H11" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function WeekStrip({ week, t, lang }: { week: { date: string; outcomes: ReportOutcome[] }[]; t: TFunction; lang: string }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {week.map((day, index) => (
        <li key={day.date} className={cx("flex flex-col items-center gap-1.5 rounded-lg py-2", index === week.length - 1 ? "bg-haldi-tint/70" : "bg-paper")}>
          <span className="text-[12px] font-semibold text-muted">{formatDay(day.date, lang, { weekday: "narrow" })}</span>
          <span className="flex min-h-[34px] flex-col items-center justify-start gap-1">
            {day.outcomes.length === 0 ? (
              <span className="text-[12px] text-line-strong">·</span>
            ) : (
              day.outcomes.map((outcome, i) => (
                <span key={i} title={t(`outcome.${outcome}`)}>
                  <OutcomeMark outcome={outcome} />
                </span>
              ))
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OutcomeLegend({ t, lang }: { t: TFunction; lang: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted">
      {(["on_time", "late", "missed", "unknown"] as const).map((outcome) => (
        <li key={outcome} className="inline-flex items-center gap-1.5">
          <OutcomeMark outcome={outcome} size={12} />
          <span lang={lang}>{t(`outcome.${outcome}`)}</span>
        </li>
      ))}
    </ul>
  );
}
