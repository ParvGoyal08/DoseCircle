/**
 * Dates, times and durations through Intl, in the reader's language, with Western digits and in IST.
 * Intl handles grammar (e.g. Kannada and Hindi unit forms) so no number is ever spliced into a sentence.
 */
const TZ = "Asia/Kolkata";

export function formatTime(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", timeZone: TZ, numberingSystem: "latn" }).format(new Date(iso));
}

export function formatDay(isoOrDate: string, lang: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00+05:30`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat(lang, { ...options, timeZone: TZ, numberingSystem: "latn" }).format(date);
}

/** "+10 min", "+45 s", "+2 h" — for timeline gaps. */
export function formatGap(seconds: number, lang: string): string {
  const [value, unit] = seconds < 90 ? [Math.round(seconds), "second"] : seconds < 90 * 60 ? [Math.round(seconds / 60), "minute"] : [Math.round(seconds / 3600), "hour"];
  return `+${new Intl.NumberFormat(lang, { style: "unit", unit, unitDisplay: "short", numberingSystem: "latn" }).format(value)}`;
}

/** "3 min ago" style. */
export function formatAgo(iso: string, lang: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short", numberingSystem: "latn" } as Intl.RelativeTimeFormatOptions);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

/** ½ and ¼ read better than 0.5 on a pill count. */
export function formatCount(count: number | null): string {
  if (count === null) return "?";
  const whole = Math.floor(count);
  const fraction = count - whole;
  const glyph = fraction === 0.5 ? "½" : fraction === 0.25 ? "¼" : fraction === 0.75 ? "¾" : "";
  if (!glyph && fraction !== 0) return String(count);
  return whole === 0 ? glyph : `${whole}${glyph}`;
}

export function formatNumber(value: number, lang: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(lang, { ...options, numberingSystem: "latn" } as Intl.NumberFormatOptions).format(value);
}
