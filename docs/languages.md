# Languages

The event is in Bengaluru, and treating Hindi as *the* Indian language would be both inaccurate and
insensitive there. So every person picks their own language, and **Kannada is first-class**.

Shipping today: **ಕನ್ನಡ (Kannada), हिन्दी (Hindi), English**. Kannada and Hindi are drafted and hidden until
reviewed (see below).

## Rules the code enforces

1. **Whole sentences, never spliced.** Kannada, Tamil and Malayalam attach case suffixes to nouns, so a
   sentence with a name or number inserted is usually wrong. No translated string contains a placeholder;
   `pnpm i18n:check` fails the build if one appears. Names go in notification titles and separate UI
   elements; numbers, dates and durations go through `Intl` with Western digits.
2. **Medicine names are never translated or transliterated.** They appear in Latin script exactly as printed
   on the strip, in a Latin font even inside Kannada text. This is where a translation mistake could harm
   someone.
3. **Nothing ships unreviewed.** Every string records `reviewedBy`. A language appears in the picker only
   when *every* string is signed off, and the tests enforce it.
4. **A missing string falls back to English, never another Indian language.**
5. **The picker** shows endonyms only (ಕನ್ನಡ, हिन्दी, English), each in its own script with the right `lang`
   attribute, no flags, and no words like "regional" or "vernacular". It pre-selects a language only if the
   browser explicitly asks for one.
6. **Layout** assumes Indic strings run long: buttons wrap, nothing is truncated on the parent's screens, and
   Kannada and Devanagari get taller line heights because their vowel signs sit above and below the line.

## The review workflow

```bash
pnpm i18n:export kn          # writes review/kn.csv: catalogue, key, english, draft, final, reviewer, notes
# the reviewer fills in "final" (only where the draft is wrong) and their name in "reviewer"
pnpm i18n:import kn review/kn.csv
pnpm i18n:check              # coverage per language, and the safety rules above
```

`reviewedBy` is set only on the rows a reviewer signed. Two reviewers are planned for Kannada, one checking
the other, and one for Hindi. Reviewers are credited by name in the README with their permission.

Current state: **0 of 325 strings reviewed** in each of Kannada and Hindi (313 app strings and 12 notification strings). The drafts were written with
Claude Code and are deliberately hidden in production builds until a native speaker signs off. Development
builds show them, marked as drafts, so the screens can be checked.

## Voice

Fixed phrases only: the four time-of-day reminders, the nudge, "marked as taken, thank you", "press the green
button", and "your family has been told". No sentence has anything inserted into it.

| Language | Voice |
|---|---|
| Hindi, Indian English | Amazon Polly, Kajal (neural), generated once at build time by `backend/scripts/gen-polly-phrases.ts` and committed as files |
| Kannada | **Native-speaker recordings.** AWS has no Kannada text-to-speech: Polly's only Indian languages are Hindi and Indian English |

`scripts/normalize-audio.sh` trims silence, makes the file mono, normalises loudness to about −16 LUFS and
writes a 64 kbps MP3 to `web/public/audio/{lang}/{phrase}.mp3`. The speaker is credited with permission.

If a language has no clip, the "Listen" button is hidden. **Another language's voice is never played.**

## Languages we did not ship

- **Tamil, Telugu, Malayalam, Marathi, Bengali:** the app is built for them (fonts, fallback rules, the picker),
  but they ship only when a native reviewer signs off. Saying "all Indian languages" while shipping machine
  translation would be worse than shipping three languages honestly.
- **Urdu:** needs right-to-left layout and a different font family.
- **Odia, Assamese:** Amazon Translate cannot even draft them, so they would need a human from scratch.

## Prescriptions

Textract reads printed and handwritten **English** only; it does not read Indic scripts. The app says so
plainly on the upload screen. The review screen itself is in the family member's own language.
