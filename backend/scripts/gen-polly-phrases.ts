/**
 * Generates the fixed voice phrases for languages Amazon Polly speaks well in India:
 * Hindi (hi-IN) and Indian English (en-IN), with the Kajal neural voice in ap-south-1.
 * Only native-reviewed strings are spoken. Kannada and other languages use native-speaker
 * recordings instead (see scripts/normalize-audio.sh); Polly has no voice for them.
 *
 *   AWS_PROFILE=dosecircle pnpm --filter @dosecircle/backend exec tsx scripts/gen-polly-phrases.ts
 */
import { PollyClient, SynthesizeSpeechCommand, type LanguageCode as PollyLanguage } from "@aws-sdk/client-polly";
import { VOICE_PHRASES, voicePhrasePath, type VoicePhraseId } from "@dosecircle/shared";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const repo = new URL("../../", import.meta.url);
const polly = new PollyClient({ region: "ap-south-1" });

/** Which reviewed string each phrase speaks. Whole sentences only. */
const PHRASE_KEYS: Record<VoicePhraseId, { catalogue: "web" | "shared"; key: string }> = {
  remind_morning: { catalogue: "web", key: "parent.prompt.morning" },
  remind_afternoon: { catalogue: "web", key: "parent.prompt.afternoon" },
  remind_evening: { catalogue: "web", key: "parent.prompt.evening" },
  remind_night: { catalogue: "web", key: "parent.prompt.night" },
  nudge: { catalogue: "shared", key: "push.nudge.body" },
  taken_thanks: { catalogue: "web", key: "parent.takenThanks" },
  press_green: { catalogue: "web", key: "voice.pressGreen" },
  family_told: { catalogue: "web", key: "parent.familyToldTaken" },
};

const VOICES: { lang: "hi" | "en"; languageCode: PollyLanguage }[] = [
  { lang: "hi", languageCode: "hi-IN" },
  { lang: "en", languageCode: "en-IN" },
];

type Catalogue = { strings: Record<string, { text: string; reviewedBy: string | null }> };
const load = (catalogue: "web" | "shared", lang: string): Catalogue =>
  JSON.parse(readFileSync(new URL(catalogue === "web" ? `web/src/i18n/${lang}.json` : `shared/i18n/${lang}.json`, repo), "utf8")) as Catalogue;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A new AWS account has a very low SynthesizeSpeech rate, low enough that even this handful of
 * phrases gets throttled when sent back to back. Since this runs once at build time, it paces
 * itself and backs off rather than asking for a quota increase.
 */
async function synthesize(languageCode: PollyLanguage, text: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await polly.send(
        new SynthesizeSpeechCommand({ Engine: "neural", VoiceId: "Kajal", LanguageCode: languageCode, OutputFormat: "mp3", SampleRate: "24000", Text: text }),
      );
      return await result.AudioStream!.transformToByteArray();
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (attempt >= 5 || (name !== "ThrottlingException" && name !== "TooManyRequestsException")) throw error;
      const backoff = 2000 * 2 ** attempt;
      console.log(`  throttled, waiting ${backoff / 1000}s`);
      await wait(backoff);
    }
  }
}

for (const { lang, languageCode } of VOICES) {
  for (const phrase of VOICE_PHRASES) {
    const { catalogue, key } = PHRASE_KEYS[phrase];
    const entry = load(catalogue, lang).strings[key];
    if (!entry?.reviewedBy) {
      console.log(`skip ${lang}/${phrase}: "${key}" is not reviewed yet`);
      continue;
    }
    const bytes = await synthesize(languageCode, entry.text);
    const out = new URL(`web/public${voicePhrasePath(lang, phrase)}`, repo);
    mkdirSync(dirname(out.pathname), { recursive: true });
    writeFileSync(out, bytes);
    console.log(`wrote ${lang}/${phrase}.mp3 (${bytes.length} bytes)`);
    await wait(1500);
  }
}
