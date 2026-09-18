import { preselectLanguage, type LanguageCode } from "@dosecircle/shared";
import { Check } from "lucide-react";
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
 */
export function LanguagePicker({ value, onChange, large = false }: { value: LanguageCode | null; onChange: (code: LanguageCode) => void; large?: boolean }) {
  const languages = pickerLanguages();
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
              <input type="radio" name="language" value={language.code} checked={selected} onChange={() => onChange(language.code)} className="sr-only" />
              {/* The badge sits under the endonym, not beside it: Kannada and Devanagari run long, and
                  alongside a two-line badge it pushed the tick past the edge of the card. */}
              <span className="flex min-w-0 flex-col gap-1 py-3">
                <span lang={language.code} className={cx("font-semibold", large ? "text-[28px]" : "text-2xl")}>
                  {language.endonym}
                </span>
                {language.draft && (
                  <span lang={language.code} className={cx("w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold", selected ? "bg-white/20 text-white" : "bg-offline-tint text-offline")}>
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
