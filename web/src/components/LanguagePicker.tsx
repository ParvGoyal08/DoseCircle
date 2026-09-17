import { preselectLanguage, type LanguageCode } from "@dosecircle/shared";
import { Check } from "lucide-react";
import { i18next, pickerLanguages } from "../i18n";
import { cx } from "./ui";

export function defaultLanguage(): LanguageCode | null {
  const offered = pickerLanguages().map((l) => l.code);
  return preselectLanguage(navigator.languages ?? [navigator.language], offered);
}

/**
 * Endonyms only, each in its own script, no flags and no "regional" labels. The heading is shown in
 * every offered language, because the reader has not chosen one yet.
 */
export function LanguagePicker({ value, onChange, large = false }: { value: LanguageCode | null; onChange: (code: LanguageCode) => void; large?: boolean }) {
  const languages = pickerLanguages();
  return (
    <fieldset>
      <legend className="w-full">
        <span className="flex flex-col gap-0.5">
          {languages.map((language) => (
            <span key={language.code} lang={language.code} className={cx("font-semibold text-ink", large ? "text-2xl" : "text-lg", language.code !== languages[0]?.code && "text-muted")}>
              {i18next.getFixedT(language.code)("lang.choose")}
            </span>
          ))}
        </span>
      </legend>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {languages.map((language) => {
          const selected = value === language.code;
          return (
            <label
              key={language.code}
              className={cx(
                "relative flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 bg-surface px-5 transition-colors",
                large ? "min-h-20" : "min-h-16",
                selected ? "border-ink bg-haldi-tint" : "border-line hover:border-line-strong",
              )}
            >
              <input type="radio" name="language" value={language.code} checked={selected} onChange={() => onChange(language.code)} className="sr-only" />
              <span lang={language.code} className={cx("font-semibold", large ? "text-[28px]" : "text-2xl")}>
                {language.endonym}
              </span>
              <span className="flex items-center gap-2">
                {language.draft && (
                  <span lang={language.code} className="rounded-full bg-offline-tint px-2 py-0.5 text-[11px] font-semibold text-offline">
                    {i18next.getFixedT(language.code)("lang.draft")}
                  </span>
                )}
                <span aria-hidden className={cx("grid size-7 place-items-center rounded-full border-2", selected ? "border-ink bg-ink text-paper" : "border-line-strong")}>
                  {selected && <Check className="size-4" strokeWidth={3} />}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
