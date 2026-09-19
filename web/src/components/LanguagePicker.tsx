import { preselectLanguage, type LanguageCode } from "@dosecircle/shared";
import { useId } from "react";
import { i18next, pickerLanguages } from "../i18n";
import { cx } from "./ui";

export function defaultLanguage(): LanguageCode | null {
  const offered = pickerLanguages().map((l) => l.code);
  return preselectLanguage(navigator.languages ?? [navigator.language], offered);
}

/**
 * The one language control in the app: the three endonyms in a quiet segmented row.
 *
 * Endonyms only, each in its own script, no flags and no "regional" labels — ಕನ್ನಡ needs no caption
 * for someone who reads Kannada. It replaced two heavier versions: three 64–80px cards per question,
 * then a boxed toggle with a shadowed pill and a standing footnote. Choosing a language is a
 * one-second decision and the control should look like one.
 *
 * `size="lg"` is for the parent's own phone: same look, but 48px tall with larger type, because the
 * person tapping it may be seventy-five.
 *
 * A draft translation is still labelled wherever it can be chosen, in its own script, but only while
 * it is the chosen one — that is when the wording on screen is the unchecked wording.
 *
 * Each control is its own radio group, so two on one page never unchoose each other.
 */
export function LanguageToggle({
  value,
  onChange,
  label,
  lang,
  size = "sm",
}: {
  value: LanguageCode | null;
  onChange: (code: LanguageCode) => void;
  /** Omit when the screen's own heading already asks the question; it stays for screen readers. */
  label?: string;
  lang: string;
  size?: "sm" | "lg";
}) {
  const languages = pickerLanguages();
  const group = useId();
  const chosenDraft = languages.find((l) => l.code === value && l.draft);
  const large = size === "lg";
  return (
    <fieldset>
      <legend lang={lang} className={label ? "mb-1.5 text-[15px] font-semibold text-ink" : "sr-only"}>
        {label ?? i18next.getFixedT(lang)("lang.choose")}
      </legend>
      <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-sunken/80 p-0.5">
        {languages.map((language) => {
          const selected = value === language.code;
          return (
            <label
              key={language.code}
              className={cx(
                "flex cursor-pointer items-center rounded-full transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-indigo",
                large ? "min-h-12 px-5 text-[18px]" : "min-h-10 px-3.5 text-[14.5px]",
                selected ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(20_19_58/0.14)]" : "font-medium text-muted hover:text-ink",
              )}
            >
              <input type="radio" name={group} value={language.code} checked={selected} onChange={() => onChange(language.code)} className="sr-only" />
              <span lang={language.code}>{language.endonym}</span>
            </label>
          );
        })}
      </div>
      {chosenDraft && (
        <p lang={chosenDraft.code} className={cx("mt-1 text-muted", large ? "text-[15px]" : "text-[12.5px]")}>
          {i18next.getFixedT(chosenDraft.code)("lang.draft")}
        </p>
      )}
    </fieldset>
  );
}
