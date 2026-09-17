import type { ReportOutcome } from "@dosecircle/shared";
import { useId, type ReactNode } from "react";
import { formatDay, formatNumber } from "../../lib/format";
import { cx } from "../ui";

/**
 * Small, dependency-free SVG charts for the analytics dashboard.
 * One meaning per colour on every chart: on time = green, late = haldi, missed = red,
 * phone offline = grey hatch. Labels sit next to the data instead of in a separate legend where possible.
 */

export const OUTCOME_FILL: Record<"on_time" | "late" | "missed" | "unknown", string> = {
  on_time: "var(--color-taken-fill)",
  late: "var(--color-haldi)",
  missed: "var(--color-missed-fill)",
  unknown: "var(--color-offline-fill)",
};

function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--color-offline-tint)" />
        <rect width="2.2" height="6" fill="var(--color-offline-fill)" />
      </pattern>
    </defs>
  );
}

export function Swatch({ outcome, className }: { outcome: keyof typeof OUTCOME_FILL; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-2.5 shrink-0 rounded-[3px]", outcome === "unknown" && "hatch", className)} style={outcome === "unknown" ? undefined : { background: OUTCOME_FILL[outcome] }} />;
}

/** Rolling share of doses taken, so one bad day doesn't dominate the line. */
export function rollingAdherence(daily: { onTime: number; late: number; missed: number }[], window = 7): (number | null)[] {
  return daily.map((_, i) => {
    const slice = daily.slice(Math.max(0, i - window + 1), i + 1);
    const taken = slice.reduce((s, d) => s + d.onTime + d.late, 0);
    const counted = taken + slice.reduce((s, d) => s + d.missed, 0);
    return counted ? taken / counted : null;
  });
}

/** Adherence trend as an area, with the 80% "good adherence" line (PQA threshold). Labels live outside the SVG. */
export function TrendArea({ values, target = 0.8, height = 96, tone = "light", min = 0.5 }: { values: (number | null)[]; target?: number; height?: number; tone?: "light" | "dark"; min?: number }) {
  const gradient = useId();
  const width = 1000;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (v: number) => (1 - (Math.max(min, v) - min) / (1 - min)) * height;
  let last = values.find((v) => v !== null) ?? 1;
  const points = values.map((v, i) => {
    if (v !== null) last = v;
    return [i * step, y(last)] as const;
  });
  // Smooth with a simple cardinal curve for a calmer line.
  const line = points
    .map(([x, py], i) => {
      if (i === 0) return `M${x} ${py}`;
      const [px, ppy] = points[i - 1]!;
      const cx = (px + x) / 2;
      return `C${cx} ${ppy} ${cx} ${py} ${x} ${py}`;
    })
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const stroke = tone === "dark" ? "#F4B400" : "var(--color-indigo-soft)";
  return (
    <div className="relative" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={tone === "dark" ? 0.32 : 0.2} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={width} y1={y(target)} y2={y(target)} stroke={tone === "dark" ? "rgb(255 255 255 / 0.35)" : "var(--color-line-strong)"} strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.length > 0 && (
        <span aria-hidden className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2" style={{ left: "100%", top: `${(points[points.length - 1]![1] / height) * 100}%`, background: stroke, ["--tw-ring-color" as string]: tone === "dark" ? "#14133A" : "var(--color-surface)" }} />
      )}
      <span aria-hidden className={cx("tabular absolute left-0 -translate-y-full pb-0.5 text-[11.5px] font-medium", tone === "dark" ? "text-white/70" : "text-muted")} style={{ top: `${(y(target) / height) * 100}%` }}>
        80%
      </span>
    </div>
  );
}

export interface ReadingLine {
  key: string;
  label: string;
  /** One value per day in `dates`; null where nothing was written down. */
  values: (number | null)[];
  stroke: string;
}

/**
 * A daily-check trend: one or two lines over the period.
 *
 * Deliberately has **no target band and no reference line**. The dose chart draws the 80% adherence
 * benchmark because that threshold is published and about behaviour; a "normal" range for blood sugar
 * or blood pressure is a clinical judgement, and drawing one here would be the app giving advice.
 * The axis is scaled to the data that exists, padded a little so a flat month is still readable.
 *
 * Days with no reading are never invented. Consecutive days join with a solid line; a jump across
 * missing days is drawn dashed, so a weekly weigh-in still reads as a trend while the gap stays visible.
 */
export function ReadingTrend({ lines, dates, height = 110, lang }: { lines: ReadingLine[]; dates: string[]; height?: number; lang: string }) {
  const clip = useId();
  const width = 1000;
  const step = dates.length > 1 ? width / (dates.length - 1) : 0;
  const numbers = lines.flatMap((l) => l.values).filter((v): v is number => v !== null);
  if (numbers.length === 0) return null;
  const lowest = Math.min(...numbers);
  const highest = Math.max(...numbers);
  // A flat series would otherwise be a line through the middle with no sense of scale.
  const pad = Math.max((highest - lowest) * 0.2, 0.5);
  const top = highest + pad;
  const bottom = lowest - pad;
  const y = (v: number) => ((top - v) / (top - bottom)) * height;

  /** Every hop between two readings, marked as adjacent days or a jump over missing ones. */
  const hops = (values: (number | null)[]) => {
    const recorded = values.map((value, index) => ({ value, index })).filter((p): p is { value: number; index: number } => p.value !== null);
    return recorded.slice(1).map((point, i) => {
      const previous = recorded[i]!;
      return { d: `M${previous.index * step} ${y(previous.value)} L${point.index * step} ${y(point.value)}`, gap: point.index - previous.index > 1 };
    });
  };

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
          <defs>
            <clipPath id={clip}>
              <rect x="0" y="0" width={width} height={height} />
            </clipPath>
          </defs>
          {lines.map((line) => (
            <g key={line.key} clipPath={`url(#${clip})`}>
              {hops(line.values).map((hop, index) => (
                <path
                  key={index}
                  d={hop.d}
                  fill="none"
                  stroke={line.stroke}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeOpacity={hop.gap ? 0.45 : 1}
                  strokeDasharray={hop.gap ? "4 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {line.values.map((value, index) =>
                value === null ? null : <circle key={index} cx={index * step} cy={y(value)} r="3" fill={line.stroke} vectorEffect="non-scaling-stroke" />,
              )}
            </g>
          ))}
        </svg>
        {/* The two labels sit at the values they name, not at the edges of the padded axis. */}
        <span aria-hidden className="tabular absolute left-0 -translate-y-1/2 bg-surface pr-1 text-[11.5px] font-medium text-muted" style={{ top: `${(y(highest) / height) * 100}%` }}>
          {formatNumber(highest, lang)}
        </span>
        <span aria-hidden className="tabular absolute left-0 -translate-y-1/2 bg-surface pr-1 text-[11.5px] font-medium text-muted" style={{ top: `${(y(lowest) / height) * 100}%` }}>
          {formatNumber(lowest, lang)}
        </span>
      </div>
      {lines.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
          {lines.map((line) => (
            <li key={line.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: line.stroke }} />
              {line.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where doses ended up, as one stacked bar (the Dexcom time-in-range pattern). */
export function OutcomeBar({ counts, labels, lang }: { counts: Record<keyof typeof OUTCOME_FILL, number>; labels: Record<keyof typeof OUTCOME_FILL, string>; lang: string }) {
  const hatch = useId();
  const total = counts.on_time + counts.late + counts.missed + counts.unknown;
  const order = ["on_time", "late", "missed", "unknown"] as const;
  let x = 0;
  return (
    <div>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-4 w-full overflow-hidden rounded-full" aria-hidden>
        <HatchDefs id={hatch} />
        {total === 0 ? (
          <rect width="100" height="10" fill="var(--color-sunken)" />
        ) : (
          order.map((key) => {
            const w = (counts[key] / total) * 100;
            const rect = <rect key={key} x={x} y="0" width={Math.max(w, 0)} height="10" fill={key === "unknown" ? `url(#${hatch})` : OUTCOME_FILL[key]} />;
            x += w;
            return rect;
          })
        )}
      </svg>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {order.map((key) => (
          <div key={key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
              <Swatch outcome={key} />
              <span lang={lang} className="truncate">
                {labels[key]}
              </span>
            </dt>
            <dd className="tabular text-lg font-semibold text-ink">
              {formatNumber(counts[key], lang)}
              <span className="ml-1.5 text-[13px] font-medium text-muted">{total ? formatNumber(counts[key] / total, lang, { style: "percent" }) : ""}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One column per day, one row per dose time: the calendar plot used in adherence monitoring research. */
export function CalendarHeatmap({ days, times, lang, outcomeLabel }: { days: { date: string; cells: Record<string, ReportOutcome> }[]; times: string[]; lang: string; outcomeLabel: (o: ReportOutcome) => string }) {
  const hatch = useId();
  const cell = 18;
  const gap = 4;
  const left = 44;
  const top = 18;
  const width = left + days.length * (cell + gap);
  const height = top + times.length * (cell + gap);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Dose calendar">
      <HatchDefs id={hatch} />
      {times.map((time, row) => (
        <text key={time} x={left - 8} y={top + row * (cell + gap) + cell * 0.72} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--color-muted)" className="tabular">
          {`${time.slice(0, 2)}:${time.slice(2)}`}
        </text>
      ))}
      {days.map((day, col) => {
        const x = left + col * (cell + gap);
        const showLabel = col === 0 || col === days.length - 1 || col % 7 === 0;
        return (
          <g key={day.date}>
            {showLabel && (
              <text x={x + cell / 2} y={11} textAnchor="middle" fontSize="10" fill="var(--color-muted)" className="tabular">
                {formatDay(day.date, lang, { day: "numeric", month: col === 0 ? "short" : undefined })}
              </text>
            )}
            {times.map((time, row) => {
              const outcome = day.cells[time];
              const fill = !outcome ? "var(--color-sunken)" : outcome === "unknown" ? `url(#${hatch})` : outcome in OUTCOME_FILL ? OUTCOME_FILL[outcome as keyof typeof OUTCOME_FILL] : "var(--color-sunken)";
              return (
                <rect key={time} x={x} y={top + row * (cell + gap)} width={cell} height={cell} rx="4" fill={fill}>
                  <title>{`${formatDay(day.date, lang)} ${time.slice(0, 2)}:${time.slice(2)} · ${outcome ? outcomeLabel(outcome) : "–"}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Minutes from reminder to "Taken", per dose. Irregular timing predicts missed doses (PMC4938894). */
export function TimingScatter({ points, dates, windowMinutes = 30, lang, windowLabel }: { points: { date: string; delayMinutes: number; late: boolean }[]; dates: string[]; windowMinutes?: number; lang: string; windowLabel: string }) {
  const width = 600;
  const height = 200;
  const left = 36;
  const bottom = 22;
  const maxY = Math.max(60, Math.ceil(Math.max(0, ...points.map((p) => p.delayMinutes)) / 15) * 15);
  const x = (date: string) => left + 24 + (dates.indexOf(date) / Math.max(1, dates.length - 1)) * (width - left - 56);
  const y = (minutes: number) => 6 + (1 - Math.max(0, minutes) / maxY) * (height - bottom - 6);
  const ticks = [0, maxY / 2, maxY];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Dose timing">
      <rect x={left} y={y(windowMinutes)} width={width - left - 6} height={y(0) - y(windowMinutes)} fill="var(--color-taken-tint)" rx="4" />
      <text x={left + 8} y={y(windowMinutes) + 15} fontSize="11" fontWeight="600" fill="var(--color-taken)">
        {windowLabel}
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={width - 6} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)" className="tabular">
            {formatNumber(Math.round(t), lang)}
          </text>
        </g>
      ))}
      {[0, Math.floor(dates.length / 2), dates.length - 1].map((i) =>
        dates[i] ? (
          <text key={i} x={x(dates[i]!)} y={height - 5} textAnchor="middle" fontSize="11" fill="var(--color-muted)" className="tabular">
            {formatDay(dates[i]!, lang, { day: "numeric", month: "short" })}
          </text>
        ) : null,
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(p.date) + ((i % 3) - 1) * 3} cy={y(p.delayMinutes)} r="5" fill={p.late ? "var(--color-haldi)" : "var(--color-taken-fill)"} stroke="var(--color-surface)" strokeWidth="1.5">
          <title>{`${formatDay(p.date, lang)} · +${p.delayMinutes} min`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Misses by weekday and time of day, to spot patterns like "Sunday nights". */
export function WeekdayHeatmap({ cells, slots, weekdayLabels, slotLabel }: { cells: { weekday: number; slotName: string; doses: number; missed: number }[]; slots: string[]; weekdayLabels: string[]; slotLabel: (slot: string) => string }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-[13px]">
        <thead>
          <tr>
            <th />
            {order.map((d) => (
              <th key={d} className="font-medium text-muted">
                {weekdayLabels[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot}>
              <th className="whitespace-nowrap pr-2 text-left font-medium text-muted">{slotLabel(slot)}</th>
              {order.map((d) => {
                const entry = cells.find((c) => c.weekday === d && c.slotName === slot);
                const rate = entry && entry.doses ? entry.missed / entry.doses : 0;
                const bg = !entry ? "var(--color-sunken)" : rate === 0 ? "var(--color-taken-tint)" : `color-mix(in oklab, var(--color-missed-fill) ${Math.round(25 + rate * 75)}%, var(--color-surface))`;
                return (
                  <td key={d} className={cx("tabular h-10 rounded-lg font-semibold", rate >= 0.34 ? "text-white" : "text-ink")} style={{ background: bg }} title={entry ? `${entry.missed}/${entry.doses}` : ""}>
                    {entry ? (entry.missed > 0 ? entry.missed : "✓") : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars for a share (0–1), with the 80% target tick. */
export function ShareBars({ rows, lang, target = 0.8 }: { rows: { key: string; label: ReactNode; value: number | null; detail?: ReactNode }[]; lang: string; target?: number }) {
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => {
        const value = row.value ?? 0;
        const tone = row.value === null ? "var(--color-line-strong)" : value >= target ? "var(--color-taken-fill)" : value >= 0.6 ? "var(--color-haldi)" : "var(--color-missed-fill)";
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{row.label}</span>
              <span className="tabular text-[15px] font-semibold text-ink">{row.value === null ? "–" : formatNumber(value, lang, { style: "percent" })}</span>
            </div>
            <div className="relative mt-1.5 h-2.5 rounded-full bg-sunken">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, value * 100)}%`, background: tone }} />
              <span aria-hidden className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink/60" style={{ left: `${target * 100}%` }} />
            </div>
            {row.detail && <div className="mt-1 text-[13px] text-muted">{row.detail}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical bars with value labels on top. */
export function Columns({ bars, lang, highlightLast = false }: { bars: { label: string; value: number; tone?: string }[]; lang: string; highlightLast?: boolean }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex h-40 items-end gap-2">
      {bars.map((bar, i) => (
        <div key={bar.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="tabular text-[13px] font-semibold text-ink">{formatNumber(bar.value, lang)}</span>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, (bar.value / max) * 100)}%`, background: bar.tone ?? (highlightLast && i === bars.length - 1 ? "var(--color-haldi)" : "var(--color-indigo-soft)") }} />
          <span className="tabular w-full truncate text-center text-[12px] font-medium text-muted">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Days of tablets left on a 30-day scale, with the warning threshold marked. */
export function DaysLeftGauge({ daysLeft, thresholdDays, horizon = 30 }: { daysLeft: number; thresholdDays: number; horizon?: number }) {
  const share = Math.min(1, daysLeft / horizon);
  const tone = daysLeft <= Math.min(2, thresholdDays) ? "var(--color-missed-fill)" : daysLeft <= thresholdDays ? "var(--color-haldi)" : "var(--color-taken-fill)";
  return (
    <div className="relative mt-2 h-3 rounded-full bg-sunken" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, share * 100)}%`, background: tone }} />
      <span className="absolute -top-1 h-5 w-0.5 rounded bg-ink/50" style={{ left: `${(thresholdDays / horizon) * 100}%` }} />
    </div>
  );
}

/** Per-day share of reminders that reached the phone. Days with a gap show in grey hatch. */
export function ReachStrip({ days, lang }: { days: { date: string; reminders: number; reached: number }[]; lang: string }) {
  return (
    <div className="flex h-12 items-end gap-[3px]">
      {days.map((day) => {
        const full = day.reminders > 0 && day.reached === day.reminders;
        const none = day.reminders === 0;
        return (
          <span
            key={day.date}
            title={`${formatDay(day.date, lang)} · ${day.reached}/${day.reminders}`}
            className={cx("block flex-1 rounded-sm", none ? "h-2 bg-sunken" : full ? "h-full bg-indigo-soft" : "hatch h-full")}
          />
        );
      })}
    </div>
  );
}
