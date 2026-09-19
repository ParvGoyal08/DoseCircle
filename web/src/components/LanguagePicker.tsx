import { preselectLanguage, type LanguageCode } from "@dosecircle/shared";
import { Check } from "lucide-react";
import { useId } from "react";
import { i18next, pickerLanguages } from "../i18n";
import { cx } from "./ui";

export function defaultLanguage(): LanguageCode | null {
  const offered = pickerLanguages().map((l) => l.code);
  return preselectLanguage(navigator.languages ?? [navigator.language], offered);
}

/**
 * Endonyms only, each in its own script, no flags and no "regional" labels.
 *
 * The prompt is never printed once per offered language. Stacking "Choose your language" in three
 * scripts above three cards that already say ಕನ್ನಡ, हिन्दी and English repeats in words what the
 * cards say in the only form that needs no reading, and it pushed the cards below the fold on a
 * small phone. The legend stays for screen readers. Screens that want a visible label write one
 * themselves, in the reader's own language.
 *
 * These big cards are for the parent's own phone, where the reader may not read the rest of the page
 * and needs a target that is hard to miss. Family members get {@link LanguageToggle} instead.
 */
export function LanguagePicker({ value, onChange, large = false }: { value: LanguageCode | null; onChange: (code: LanguageCode) => void; large?: boolean }) {
  const languages = pickerLanguages();
  const group = useId();
  return (
    <fieldset>
      <legend className="sr-only">{i18next.getFixedT(value ?? "en")("lang.choose")}</legend>
      {/* No top margin: the legend is screen-reader only, so anything here would be dead space. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {languages.map((language) => {
          const selected = value === language.code;
          return (
            <label
              key={language.code}
              className={cx(
                "pressable relative flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-card)] px-5 ring-1",
                large ? "min-h-20" : "min-h-16",
                selected ? "bg-indigo text-white ring-indigo" : "bg-surface ring-line-strong hover:ring-indigo-soft",
              )}
            >
              <input type="radio" name={group} value={language.code} checked={selected} onChange={() => onChange(language.code)} className="sr-only" />
              {/* The badge sits under the endonym, not beside it: Kannada and Devanagari run long, and
                  alongside a two-line badge it pushed the tick past the edge of the card. */}
              <span className="flex min-w-0 flex-col gap-1 py-3">
                <span lang={language.code} className={cx("font-semibold", large ? "text-[28px]" : "text-2xl")}>
                  {language.endonym}
                </span>
                {language.draft && (
                  <span lang={language.code} className={cx("w-fit rounded-full px-2 py-0.5 text-[12.5px] font-semibold", selected ? "bg-white/20 text-white" : "bg-offline-tint text-offline")}>
                    {i18next.getFixedT(language.code)("lang.draft")}
                  </span>
                )}
              </span>
              <span aria-hidden className={cx("grid size-7 shrink-0 place-items-center rounded-full border-2", selected ? "border-white bg-white text-indigo" : "border-line-strong")}>
                {selected && <Check className="size-4" strokeWidth={3} />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * One row, one tap: the endonyms as a segmented control, for family members filling in a form.
 *
 * Three stacked 64px cards per question made a two-question form scroll for several screens on a
 * phone. The endonyms carry the meaning on their own, so nothing is lost by making them small.
 *
 * Draft languages keep their mark — a dot after the name and one line underneath saying what it
 * means — because nobody should be shown unchecked wording as though it were finished. Each toggle
 * is its own radio group: two on one page used to share the name "language", so to the browser,
 * choosing a parent's language unchose your own.
 */
export function LanguageToggle({ value, onChange, label, lang }: { value: LanguageCode | null; onChange: (code: LanguageCode) => void; label?: string; lang: string }) {
  const languages = pickerLanguages();
  const group = useId();
  const drafts = languages.filter((l) => l.draft);
  return (
    <fieldset>
      {/* Without a label the screen's own heading already says it; the legend stays for screen readers. */}
      <legend lang={lang} className={label ? "mb-2 text-[15px] font-semibold text-ink" : "sr-only"}>
        {label ?? i18next.getFixedT(lang)("lang.choose")}
      </legend>
      <div className="inline-flex w-full rounded-xl bg-sunken p-1 ring-1 ring-line sm:w-auto">
        {languages.map((language) => {
          const selected = value === language.code;
          return (
            <label
              key={language.code}
              className={cx(
                "relative flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg px-4 text-[16px] font-semibold transition-colors sm:flex-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo",
                selected ? "bg-surface text-ink shadow-[0_1px_2px_rgb(20_19_58/0.12),0_2px_8px_-2px_rgb(20_19_58/0.12)]" : "text-muted hover:text-ink",
              )}
            >
              <input type="radio" name={group} value={language.code} checked={selected} onChange={() => onChange(language.code)} className="sr-only" />
              <span lang={language.code}>{language.endonym}</span>
              {language.draft && <span aria-hidden className={cx("size-1.5 rounded-full", selected ? "bg-blue-600" : "bg-line-strong")} />}
            </label>
          );
        })}
      </div>
      {drafts.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-line-strong" />
          {drafts.map((d, i) => (
            <span key={d.code} lang={d.code}>
              {i18next.getFixedT(d.code)("lang.draft")}
              {i < drafts.length - 1 ? " ·" : ""}
            </span>
          ))}
        </p>
      )}
    </fieldset>
  );
}
