# Languages

The event is in Bengaluru, and treating Hindi as *the* Indian language would be both inaccurate and
insensitive there. So every person picks their own language, and **Kannada is first-class**.

Shipping today: **ಕನ್ನಡ (Kannada), हिन्दी (Hindi), English**. Kannada and Hindi are **drafts**, offered in
the app and labelled as drafts wherever a language is chosen, pending native review (see below).

## Rules the code enforces

1. **Whole sentences, never spliced.** Kannada, Tamil and Malayalam attach case suffixes to nouns, so a
   sentence with a name or number inserted is usually wrong. No translated string contains a placeholder;
   `pnpm i18n:check` fails the build if one appears. Names go in notification titles and separate UI
   elements; numbers, dates and durations go through `Intl` with Western digits.
2. **Medicine names are never translated or transliterated.** They appear in Latin script exactly as printed
   on the strip, in a Latin font even inside Kannada text. This is where a translation mistake could harm
   someone.
   The same applies to **units and ranges**: `mmHg`, `mg/dL`, `kg` and "20–700" are their own UI elements in
   Latin script beside the box, never spliced into a translated sentence.
3. **A reminder that is only about a reading never says "medicine".** There is a second set of nine
   notification strings for check-only reminders, so a family is told "the reading has not been written down
   yet", not "the medicine has not been confirmed". Whenever a reminder carries both, the medicine wording
   stands, because the one tap confirms the whole reminder.
4. **Nothing unreviewed is passed off as finished.** Every string records `reviewedBy`, and any language
   that is not fully signed off carries a "draft translation" badge everywhere a language is chosen. A
   test asserts that badge matches the review state, so an unreviewed language can never look finished.

   Whether drafts are *offered at all* is one switch, `VITE_SHOW_DRAFT_LANGUAGES`, set by
   `scripts/deploy.sh`. It is **on** today: a Kannada speaker reading a draft of her own language, clearly
   marked, is more use to her than an English screen she cannot read, and the review is still to come.
   Turning it off holds both languages back until every string is signed off, and the same code runs
   either way. The judgement behind that default is worth stating plainly rather than burying: the risk
   it accepts is a clumsy sentence, not a wrong instruction, because of the rules above — medicine names
   are never translated, and no sentence has a name, a number or a dose spliced into it.
5. **A missing string falls back to English, never another Indian language.**
6. **The picker** shows endonyms only (ಕನ್ನಡ, हिन्दी, English), each in its own script with the right `lang`
   attribute, no flags, and no words like "regional" or "vernacular". It pre-selects a language only if the
   browser explicitly asks for one.
7. **Layout** assumes Indic strings run long: buttons wrap, nothing is truncated on the parent's screens, and
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

Current state: **0 of 404 strings reviewed** in each of Kannada and Hindi (383 app strings and 21 notification
strings). The drafts were written with Claude Code. They are offered in the app and marked "draft translation"
wherever a language is chosen; the review below replaces them string by string, and the badge disappears for a
language only when all 404 are signed off.

## Voice

Fixed phrases only: the four time-of-day reminders, the nudge, "marked as taken, thank you", "press the green
button", and "your family has been told". No sentence has anything inserted into it.

| Language | Voice |
|---|---|
| Hindi, Indian English | Amazon Polly, Kajal (neural), generated once at build time by `backend/scripts/gen-polly-phrases.ts` and committed as files. Hindi is spoken from the draft, like the Hindi text; `SPEAK_DRAFTS=true` is what records an unreviewed language, and the eight phrases are fixed sentences with no name, number or medicine name in them |
| Kannada | **Native-speaker recordings.** AWS has no Kannada text-to-speech: Polly's only Indian languages are Hindi and Indian English |

`scripts/normalize-audio.sh` trims silence, makes the file mono, normalises loudness to about −16 LUFS and
writes a 64 kbps MP3 to `web/public/audio/{lang}/{phrase}.mp3`. The speaker is credited with permission.

If a language has no clip, the "Listen" button is hidden — which is why Kannada is text-only for now.
**Another language's voice is never played.**

## Languages we did not ship

- **Tamil, Telugu, Malayalam, Marathi, Bengali:** the app is built for them (fonts, fallback rules, the
  picker) but has no strings for them at all, not even drafts, so asking for one still gives English. They
  ship when someone writes and reviews them. Claiming "all Indian languages" on the strength of machine
  translation would be worse than shipping three and saying exactly how finished each one is.
- **Urdu:** needs right-to-left layout and a different font family.
- **Odia, Assamese:** Amazon Translate cannot even draft them, so they would need a human from scratch.

## Prescriptions

Textract reads printed and handwritten **English** only; it does not read Indic scripts. The app says so
plainly on the upload screen. The review screen itself is in the family member's own language.
