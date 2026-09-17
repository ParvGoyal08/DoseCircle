/**
 * Exports a review sheet for native speakers, and imports it back.
 *
 *   node scripts/review-sheet.ts export kn            → review/kn.csv
 *   node scripts/review-sheet.ts import kn review/kn.csv
 *
 * Columns: catalogue, key, english, draft, final, reviewer, notes.
 * A row is applied only when "reviewer" is filled in. "final" replaces the draft when given;
 * leaving it empty means the reviewer approves the draft as it is.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CATALOGUES, DRAFT_LANGUAGES, parseCsv, read, toCsv, write } from "./i18n-lib.ts";

const [command, code, file] = process.argv.slice(2);
if (!command || !code || !(DRAFT_LANGUAGES as readonly string[]).includes(code)) {
  console.error(`Usage: node scripts/review-sheet.ts export|import <${DRAFT_LANGUAGES.join("|")}> [file.csv]`);
  process.exit(2);
}

if (command === "export") {
  const rows = [["catalogue", "key", "english", "draft", "final", "reviewer", "notes"]];
  for (const { name, dir } of CATALOGUES) {
    const en = read(`${dir}/en.json`);
    const target = read(`${dir}/${code}.json`);
    for (const [key, source] of Object.entries(en.strings)) {
      const entry = target.strings[key];
      rows.push([name, key, source.text, entry?.text ?? "", "", entry?.reviewedBy ?? "", ""]);
    }
  }
  mkdirSync("review", { recursive: true });
  const out = file ?? `review/${code}.csv`;
  writeFileSync(out, toCsv(rows));
  console.log(`Wrote ${rows.length - 1} rows to ${out}`);
} else if (command === "import") {
  if (!file) throw new Error("Give the reviewed CSV file");
  const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
  const col = (name: string) => header!.indexOf(name);
  let applied = 0;
  for (const { name, dir } of CATALOGUES) {
    const path = `${dir}/${code}.json`;
    const catalogue = read(path);
    for (const row of rows.filter((r) => r[col("catalogue")] === name)) {
      const key = row[col("key")]!;
      const reviewer = row[col("reviewer")]?.trim();
      const entry = catalogue.strings[key];
      if (!entry || !reviewer) continue;
      const final = row[col("final")]?.trim();
      catalogue.strings[key] = { text: final || entry.text, reviewedBy: reviewer };
      applied++;
    }
    write(path, catalogue);
  }
  console.log(`Applied ${applied} reviewed strings. Run: node scripts/check-i18n.ts`);
} else {
  console.error(`Unknown command ${command}`);
  process.exit(2);
}
