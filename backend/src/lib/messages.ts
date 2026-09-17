import { FALLBACK_LANGUAGE, isLanguageCode, type LanguageCode } from "@dosecircle/shared";
import en from "../../../shared/i18n/en.json" with { type: "json" };

interface CatalogueFile {
  strings: Record<string, { text: string; reviewedBy: string | null }>;
}

/**
 * Server-side strings for push notifications. Only reviewed strings are used; anything missing or
 * unreviewed falls back to English — never to another Indian language.
 * Additional languages are registered here once their files pass scripts/check-i18n.ts.
 */
const catalogues: Partial<Record<LanguageCode, CatalogueFile>> = {
  en: en as CatalogueFile,
};

export function message(language: string | null | undefined, key: string): string {
  const lang: LanguageCode = language && isLanguageCode(language) ? language : FALLBACK_LANGUAGE;
  const entry = catalogues[lang]?.strings[key];
  if (entry?.reviewedBy) return entry.text;
  const fallback = catalogues[FALLBACK_LANGUAGE]?.strings[key];
  if (!fallback) throw new Error(`Missing source string "${key}"`);
  return fallback.text;
}

export function messageLanguage(language: string | null | undefined, key: string): LanguageCode {
  const lang: LanguageCode = language && isLanguageCode(language) ? language : FALLBACK_LANGUAGE;
  return catalogues[lang]?.strings[key]?.reviewedBy ? lang : FALLBACK_LANGUAGE;
}
