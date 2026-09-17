import { validateReading, type CheckField } from "@dosecircle/shared";
import { Check } from "lucide-react";
import { useT } from "../i18n";
import type { CheckLine } from "../lib/types";
import { cx } from "./ui";

/**
 * The boxes a parent types a measurement into: one large numeric field per value, the unit beside it
 * and the machine's plausible range underneath. No dropdowns, no sliders, nothing to swipe.
 *
 * Deliberately says nothing about what a number means. The wide limits only catch a slipped finger
 * (a weight of 700, a systolic of 20) so a typo never reaches the doctor's report.
 */

export type ReadingDraft = Record<string, Record<string, string>>;

/** The readings that are complete enough to send, in the API's shape. */
export function readyReadings(checks: readonly CheckLine[], draft: ReadingDraft): { checkId: string; values: Record<string, number> }[] {
  const ready: { checkId: string; values: Record<string, number> }[] = [];
  for (const check of checks) {
    const values = numbersFor(check, draft);
    if (Object.keys(values).length > 0 && validateReading(check.type, values).length === 0) ready.push({ checkId: check.checkId, values });
  }
  return ready;
}

/** Whether anything typed so far is out of range, so the screen can say so before it is sent. */
export function readingProblems(checks: readonly CheckLine[], draft: ReadingDraft): string[] {
  const bad: string[] = [];
  for (const check of checks) {
    const values = numbersFor(check, draft);
    if (Object.keys(values).length === 0) continue;
    for (const problem of validateReading(check.type, values)) if (problem.reason === "out_of_range") bad.push(`${check.checkId}.${problem.field}`);
  }
  return bad;
}

function numbersFor(check: CheckLine, draft: ReadingDraft): Record<string, number> {
  const values: Record<string, number> = {};
  for (const field of check.fields) {
    const raw = draft[check.checkId]?.[field.key]?.trim();
    if (raw) values[field.key] = Number(raw.replace(",", "."));
  }
  return values;
}

export interface ReadingEntryProps {
  checks: readonly CheckLine[];
  draft: ReadingDraft;
  onChange: (draft: ReadingDraft) => void;
  /** Readings already written down today, keyed by checkId. */
  recorded?: Record<string, string>;
  /** The reader's language; unreviewed languages fall back to English inside useT. */
  lang: string;
  framed?: boolean;
  disabled?: boolean;
}

export function ReadingEntry({ checks, draft, onChange, recorded = {}, lang: langCode, framed = false, disabled = false }: ReadingEntryProps) {
  const { t, lang } = useT(langCode);
  if (checks.length === 0) return null;
  const outOfRange = new Set(readingProblems(checks, draft));

  const set = (checkId: string, key: string, value: string) => {
    // Only digits, one separator and a minus-free number: a phone keypad can still offer letters.
    const cleaned = value.replace(/[^\d.,]/g, "").slice(0, 6);
    onChange({ ...draft, [checkId]: { ...draft[checkId], [key]: cleaned } });
  };

  return (
    <section className="mt-6" aria-labelledby="readings-heading">
      <h2 id="readings-heading" lang={lang} className={cx("font-semibold text-ink", framed ? "text-xl" : "text-[22px]")}>
        {t("parent.readings.title")}
      </h2>
      <p lang={lang} className="mt-1 text-lg text-muted">
        {t("parent.readings.prompt")}
      </p>

      <ul className="mt-4 space-y-3">
        {checks.map((check) => {
          const done = recorded[check.checkId];
          return (
            <li key={check.checkId} className={cx("sticker bg-surface", framed ? "p-3" : "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <p lang={lang} className={cx("font-semibold text-ink", framed ? "text-xl" : "text-2xl")}>
                  {t(`check.${check.type}`)}
                </p>
                {done && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-taken-tint px-3 py-1 text-base font-semibold text-taken">
                    <Check aria-hidden className="size-4" strokeWidth={3} />
                    <span className="tabular" lang="en">
                      {done}
                    </span>
                  </span>
                )}
              </div>
              <div className={cx("mt-3 grid gap-3", check.fields.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                {check.fields.map((field) => (
                  <NumberBox
                    key={field.key}
                    field={field}
                    // A single-value check is already named by the card heading, so only the unit is repeated.
                    label={check.fields.length === 1 ? null : t(`field.${field.key}`)}
                    lang={lang}
                    value={draft[check.checkId]?.[field.key] ?? ""}
                    invalid={outOfRange.has(`${check.checkId}.${field.key}`)}
                    disabled={disabled}
                    onChange={(value) => set(check.checkId, field.key, value)}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {outOfRange.size > 0 && (
        <p lang={lang} role="alert" className="mt-3 text-lg font-semibold text-missed">
          {t("parent.readings.invalid")}
        </p>
      )}
      <p lang={lang} className="mt-2 text-base text-muted">
        {t("parent.readings.skip")}
      </p>
    </section>
  );
}

function NumberBox({
  field,
  label,
  lang,
  value,
  invalid,
  disabled,
  onChange,
}: {
  field: CheckField;
  label: string | null;
  lang: string;
  value: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `reading-${field.key}`;
  return (
    <label htmlFor={id} className="block">
      {/* The unit and the range are their own elements, never spliced into a translated sentence. */}
      <span className="flex flex-wrap items-baseline gap-x-2">
        {label && (
          <span lang={lang} className="text-base font-medium text-muted">
            {label}
          </span>
        )}
        <span lang="en" className="text-base font-medium text-muted">
          {field.unit}
        </span>
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={`${id}-range`}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "tabular mt-1 min-h-16 w-full min-w-0 rounded-2xl border-2 bg-paper px-3 text-center text-[30px] font-semibold text-ink outline-none",
          invalid ? "border-missed" : "border-line-strong focus-visible:border-ink",
        )}
      />
      <span id={`${id}-range`} lang="en" className="tabular mt-1 block text-sm text-muted">
        {field.min}–{field.max}
      </span>
    </label>
  );
}
