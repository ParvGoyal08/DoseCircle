/**
 * Checks every translation catalogue against its English source:
 *   - the same keys, in any order
 *   - no placeholders or interpolation, because sentences are never spliced
 *   - brand and medicine-adjacent Latin terms kept as written
 *   - a reviewed entry is not identical to English unless it is a brand name
 * Prints how much of each language is reviewed. Exits non-zero on structural problems.
 *
 *   node scripts/check-i18n.ts
 */
import { CATALOGUES, DRAFT_LANGUAGES, read } from "./i18n-lib.ts";

const KEEP_LATIN = ["DoseCircle", "WhatsApp", "Amazon Textract", "Amazon Bedrock", "Claude", "Safari", "PDF"];
/** On-screen labels of other apps must match what the phone actually shows. */
const KEEP_LABELS: Record<string, string[]> = {
  "install.ios.step1": ["Share"],
  "install.ios.step2": ["Add to Home Screen"],
  "install.android.manual": ["Add to Home screen", "Install app"],
};
let problems = 0;
const problem = (message: string) => {
  problems++;
  console.error(`  ✗ ${message}`);
};

for (const { name, dir } of CATALOGUES) {
  const en = read(`${dir}/en.json`);
  const sourceKeys = Object.keys(en.strings);
  console.log(`\n${name} (${sourceKeys.length} strings)`);

  for (const [key, entry] of Object.entries(en.strings)) {
    if (/\{\{|\}\}|%s|\$\{/.test(entry.text)) problem(`en ${key}: placeholders are not allowed; put names and numbers in separate elements`);
  }

  for (const code of DRAFT_LANGUAGES) {
    const catalogue = read(`${dir}/${code}.json`);
    const keys = Object.keys(catalogue.strings);
    for (const key of sourceKeys.filter((k) => !keys.includes(k))) problem(`${code} ${key}: missing`);
    for (const key of keys.filter((k) => !sourceKeys.includes(k))) problem(`${code} ${key}: not in English source`);

    let reviewed = 0;
    for (const [key, entry] of Object.entries(catalogue.strings)) {
      const source = en.strings[key];
      if (!source) continue;
      if (!entry.text.trim()) problem(`${code} ${key}: empty text`);
      if (/\{\{|\}\}|%s|\$\{/.test(entry.text)) problem(`${code} ${key}: placeholders are not allowed`);
      for (const term of KEEP_LATIN) if (source.text.includes(term) && !entry.text.includes(term)) problem(`${code} ${key}: keep "${term}" as written`);
      for (const term of KEEP_LABELS[key] ?? []) if (!entry.text.includes(term)) problem(`${code} ${key}: keep the phone's label "${term}"`);
      if (entry.reviewedBy) {
        reviewed++;
        if (entry.text === source.text && key !== "app.name") problem(`${code} ${key}: marked reviewed but still English`);
      }
    }
    const share = Math.round((reviewed / sourceKeys.length) * 100);
    console.log(`  ${code}: ${reviewed}/${sourceKeys.length} reviewed (${share}%)${reviewed === sourceKeys.length ? " — ships unmarked" : ' — ships marked "draft translation" until 100%'}`);
  }
}

if (problems > 0) {
  console.error(`\n${problems} problem(s)`);
  process.exit(1);
}
console.log("\nStructure OK");
