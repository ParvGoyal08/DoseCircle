# Design: "Ink & Haldi"

Two audiences, one design system. Amma needs one calm screen she can read in daylight without her glasses.
Her children need a dashboard that answers "how is she really doing?" in five seconds. The choices below are
mostly evidence-led, and the evidence is cited.

## Colour

| Role | Value | Contrast on the page |
|---|---|---|
| Ink (all text) | `#14133A` | 16.6:1 |
| Muted text | `#4A4B68` | 7.9:1 |
| Indigo (primary buttons, hero surfaces) | `#25236E` | 12.7:1, white on it 13.6:1 |
| Haldi (highlights, fills) | `#F4B400` | **1.7:1 — never used for text** |
| Taken | `#03573F` | 8.0:1 |
| Late | `#6B4800` | 7.7:1 |
| Missed | `#9F1D12` | 7.4:1 |
| Phone offline | `#3F4A5A` | 8.4:1, plus a hatch pattern |

- **Every text colour clears 7:1**, the WCAG 2.2 AAA level, which exists because contrast sensitivity falls
  with age ([W3C 1.4.6](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced)).
- **Haldi is a fill, never text.** Turmeric yellow is 1.85:1 on white and 1.7:1 on the page, so it only ever sits behind ink text
  (9.6:1 the other way) or on the dark hero.
- **Colour is never the only signal.** Every status carries a colour, an icon and a word, and "phone offline"
  also gets a hatch pattern, because blue–yellow discrimination declines with age
  ([Sci Rep 2020](https://www.nature.com/articles/s41598-020-78303-4)).

## Light by default, dark on request

Dark text on a light background reads better at every age
([PubMed 23654206](https://pubmed.ncbi.nlm.nih.gov/23654206/)), and older adults showed a higher mental load
with dark mode in bright rooms ([ETRA 2025](https://dl.acm.org/doi/10.1145/3715669.3725879)) — which matters
in Indian daylight. But people with cataracts read faster in dark mode
([NN/g](https://www.nngroup.com/articles/dark-mode/)), so a dark theme is one tap away and every colour above
has a dark-theme counterpart that also clears 7:1.

## Type

**Inter** for Latin, **Anek Kannada** and **Anek Devanagari** for Indic scripts, self-hosted (no third-party
font requests, and they work offline in the installed app). Body text is at least 16px, the parent's screens
far larger; numbers use tabular figures so columns line up.

## The parent's screen

One screen, one action.

- The time of day and the tablets, with names exactly as printed, and a large count chip per medicine.
- A green confirm button at least 128px tall, with a 10-second undo afterwards instead of an "are you sure?"
  dialog.
- Touch targets of 48px or more, which is above the WCAG AAA 44px target
  ([W3C 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)), and no dropdowns,
  sliders or swipe-only actions.
- No decorative illustration competing with the one thing she has to do.

## The family dashboard

Modelled on how the best consumer health apps are structured: one headline number, a short list of colours
that always mean the same thing, then a glance → trend → detail drill-down
([WHOOP breakdown](https://www.925studios.co/blog/whoop-design-breakdown),
[Oura 2025 redesign](https://ouraring.com/blog/new-oura-app-experience/)).

Choices that came from research rather than taste:

- **The 80% line** on the adherence trend is the standard threshold for good adherence
  ([PQA adherence measures](https://www.pqaalliance.org/adherence-measures)).
- **A dose calendar** (one row per dose time, one column per day) is the established way to show adherence
  history from electronic monitoring
  ([MEMS calendar plot](https://www.researchgate.net/figure/Standard-MEMSR-bottle-calendar-plot_fig1_51676091)).
- **Timing, not just taken-or-not.** People whose dose times varied most were 9.3× more likely to fall below
  target ([PMC4938894](https://pmc.ncbi.nlm.nih.gov/articles/PMC4938894/)), so the dashboard plots minutes
  from reminder to taken and flags irregular timing.
- **One stacked bar for outcomes**, the "time in range" pattern from glucose reports
  ([Dexcom AGP](https://www.dexcom.com/en-us/faqs/what-is-the-agp-report)).
- **Per-medicine adherence and a plain summary** are what patients, families and clinicians asked for in
  interviews ([J Med Syst 2025](https://link.springer.com/article/10.1007/s10916-025-02189-w)).
- **An offline phone is never counted as a missed dose**, anywhere, including the doctor report.

Charts are hand-built SVG (no charting library), so they inherit the palette, respect the dark theme, and add
nothing to the download beyond a few kilobytes.

### The reading charts have no target line, on purpose

The adherence chart draws the 80% line because that threshold is published and is about *behaviour*. A
"normal" band for blood sugar or blood pressure is a clinical judgement about a particular person, so
drawing one would be the app quietly giving medical advice. The daily-check panels therefore show:

- the line, scaled to the data that actually exists;
- the days it was written down out of the days it was asked for;
- lowest, middle and highest — descriptions of the data, not verdicts on it.

Days with no reading are never filled in. Consecutive days join with a solid line and a jump across missing
days is drawn dashed, so a weekly weigh-in still reads as a trend while the gap stays visible.

### Typing a number on the parent's screen

One full-width box per value, at least 64px tall, centred 30px digits, `inputMode="decimal"`. The unit sits
in the label and the plausible range underneath, both in Latin script as their own elements — never inside a
translated sentence. A value outside the range turns the border red, says so in one whole sentence, and
**disables the confirm button**, so a typo is corrected on the phone rather than losing the confirmation to
a rejected request.

## Motion

Short and purposeful: the alert travelling along the family circle, the claim sliding in, the confirm tick.
Everything respects `prefers-reduced-motion`, and the live family-circle diagram jumps to its final state when
reduced motion is on.

## What we chose not to do

- No stock template look, no purple gradients, no glassmorphism except one restrained card on the dark hero.
- No cartoon characters. An earlier version had illustrated family members; it read as a children's app, and
  the pastel fills failed the contrast bar.
- No decorative pattern behind text. Decoration stays on the hero surfaces, never behind a sentence someone
  has to read.
