/**
 * Languages the app can show. A language appears in the picker only when every string has been
 * reviewed by a native speaker (enforced by scripts/check-i18n.ts), regardless of this list.
 */

export type LanguageCode = "en" | "kn" | "hi" | "ta" | "te" | "ml" | "mr" | "bn";

/** Where voice clips come from. AWS has no Kannada/Tamil/Telugu/Malayalam/Marathi/Bengali text-to-speech. */
export type VoiceSource = "polly" | "recording";

export interface LanguageInfo {
  code: LanguageCode;
  /** The language's name in its own script — the only label shown in the picker. */
  endonym: string;
  englishName: string;
  /** Google Fonts family (Anek superfamily). */
  fontFamily: string;
  /** BCP 47 tag for Polly, or null when voice must be a native recording. */
  pollyLanguageCode: "hi-IN" | "en-IN" | null;
  voiceSource: VoiceSource;
  launch: boolean;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "kn", endonym: "ಕನ್ನಡ", englishName: "Kannada", fontFamily: "Anek Kannada", pollyLanguageCode: null, voiceSource: "recording", launch: true },
  { code: "hi", endonym: "हिन्दी", englishName: "Hindi", fontFamily: "Anek Devanagari", pollyLanguageCode: "hi-IN", voiceSource: "polly", launch: true },
  { code: "en", endonym: "English", englishName: "English", fontFamily: "Anek Latin", pollyLanguageCode: "en-IN", voiceSource: "polly", launch: true },
  { code: "ta", endonym: "தமிழ்", englishName: "Tamil", fontFamily: "Anek Tamil", pollyLanguageCode: null, voiceSource: "recording", launch: false },
  { code: "te", endonym: "తెలుగు", englishName: "Telugu", fontFamily: "Anek Telugu", pollyLanguageCode: null, voiceSource: "recording", launch: false },
  { code: "ml", endonym: "മലയാളം", englishName: "Malayalam", fontFamily: "Anek Malayalam", pollyLanguageCode: null, voiceSource: "recording", launch: false },
  { code: "mr", endonym: "मराठी", englishName: "Marathi", fontFamily: "Anek Devanagari", pollyLanguageCode: null, voiceSource: "recording", launch: false },
  { code: "bn", endonym: "বাংলা", englishName: "Bengali", fontFamily: "Anek Bangla", pollyLanguageCode: null, voiceSource: "recording", launch: false },
];

/** Missing strings fall back to English — never to another Indian language. */
export const FALLBACK_LANGUAGE: LanguageCode = "en";

export function languageInfo(code: LanguageCode): LanguageInfo {
  const info = LANGUAGES.find((l) => l.code === code);
  if (!info) throw new Error(`Unknown language "${code}"`);
  return info;
}

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

/** Pre-select a shipped language only when the browser explicitly prefers it; otherwise pre-select nothing. */
export function preselectLanguage(
  browserLanguages: readonly string[],
  shipped: readonly LanguageCode[],
): LanguageCode | null {
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base && isLanguageCode(base) && shipped.includes(base)) return base;
  }
  return null;
}

/** Fixed voice phrases. Regional sentences never have names or numbers inserted into them. */
export const VOICE_PHRASES = [
  "remind_morning",
  "remind_afternoon",
  "remind_evening",
  "remind_night",
  "nudge",
  "taken_thanks",
  "press_green",
  "family_told",
] as const;
export type VoicePhraseId = (typeof VOICE_PHRASES)[number];

export function voicePhrasePath(language: LanguageCode, phrase: VoicePhraseId): string {
  return `/audio/${language}/${phrase}.mp3`;
}
