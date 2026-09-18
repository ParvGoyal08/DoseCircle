import { FALLBACK_LANGUAGE, LANGUAGES, type LanguageCode } from "@dosecircle/shared";
import i18next, { type TFunction } from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { config } from "../lib/config";
import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";

interface Catalogue {
  strings: Record<string, { text: string; reviewedBy: string | null }>;
}

const catalogues: Partial<Record<LanguageCode, Catalogue>> = { en, kn, hi };
const sourceKeys = Object.keys(en.strings);

/** A language ships only when every source key exists and a native speaker has reviewed it. */
export function isFullyReviewed(code: LanguageCode): boolean {
  const catalogue = catalogues[code];
  return Boolean(catalogue) && sourceKeys.every((key) => Boolean(catalogue!.strings[key]?.reviewedBy));
}

export interface PickerLanguage {
  code: LanguageCode;
  endonym: string;
  draft: boolean;
}

/** Languages offered in the picker. Drafts appear only in development or when explicitly enabled, and are marked. */
export function pickerLanguages(): PickerLanguage[] {
  return LANGUAGES.filter((l) => catalogues[l.code])
    .map((l) => ({ code: l.code, endonym: l.endonym, draft: !isFullyReviewed(l.code) }))
    .filter((l) => !l.draft || config.showDraftLanguages);
}

/**
 * The language actually used for text: unreviewed languages fall back to English, never to another
 * Indian language.
 *
 * `allowDrafts` is for the one place that must show a draft on purpose — the landing page's
 * side-by-side illustration of three people reading three scripts, which is labelled as drafts.
 * Nothing a parent or family member acts on ever passes it, so the review gate still holds where it
 * matters.
 */
export function displayLanguage(code: LanguageCode | string | null | undefined, allowDrafts = false): LanguageCode {
  const match = LANGUAGES.find((l) => l.code === code);
  if (!match) return FALLBACK_LANGUAGE;
  if (isFullyReviewed(match.code)) return match.code;
  // A draft can only be shown for a language we actually have strings for: several languages are
  // planned and listed but have no catalogue yet, and asking for one must not set `lang="ta"` on
  // elements that will then render English.
  return (config.showDraftLanguages || allowDrafts) && catalogues[match.code] ? match.code : FALLBACK_LANGUAGE;
}

/**
 * Every string is loaded, reviewed or not. What ships is decided by `displayLanguage`, which picks
 * the language, rather than by leaving holes in the catalogue: a half-filled catalogue made a
 * deliberately-requested draft silently render in English.
 */
function resources() {
  return Object.fromEntries(
    Object.entries(catalogues).map(([code, catalogue]) => [
      code,
      { translation: Object.fromEntries(Object.entries(catalogue!.strings).map(([key, entry]) => [key, entry.text])) },
    ]),
  );
}

void i18next.use(initReactI18next).init({
  resources: resources(),
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  keySeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18next };

/**
 * Text for one person in their own language. The demo shows three people at once, so screens take
 * the language explicitly instead of relying on one global setting.
 */
export function useT(lang: LanguageCode | string | null | undefined, allowDrafts = false): { t: TFunction; lang: LanguageCode } {
  const resolved = displayLanguage(lang, allowDrafts);
  useTranslation(); // re-render when resources change
  return { t: i18next.getFixedT(resolved), lang: resolved };
}
