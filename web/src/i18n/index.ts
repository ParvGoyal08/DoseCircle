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

/** The language actually used for text: unreviewed languages fall back to English, never to another Indian language. */
export function displayLanguage(code: LanguageCode | string | null | undefined): LanguageCode {
  const match = LANGUAGES.find((l) => l.code === code);
  if (!match) return FALLBACK_LANGUAGE;
  return isFullyReviewed(match.code) || config.showDraftLanguages ? match.code : FALLBACK_LANGUAGE;
}

function resources() {
  return Object.fromEntries(
    Object.entries(catalogues).map(([code, catalogue]) => [
      code,
      {
        translation: Object.fromEntries(
          Object.entries(catalogue!.strings)
            // Unreviewed strings are left out unless drafts are allowed, so i18next falls back to English.
            .filter(([, entry]) => entry.reviewedBy || config.showDraftLanguages)
            .map(([key, entry]) => [key, entry.text]),
        ),
      },
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
export function useT(lang: LanguageCode | string | null | undefined): { t: TFunction; lang: LanguageCode } {
  const resolved = displayLanguage(lang);
  useTranslation(); // re-render when resources change
  return { t: i18next.getFixedT(resolved), lang: resolved };
}
