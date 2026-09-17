import { readFileSync, writeFileSync } from "node:fs";

export interface Entry {
  text: string;
  reviewedBy: string | null;
}

export interface Catalogue {
  _meta: Record<string, string>;
  strings: Record<string, Entry>;
}

/** The two catalogues: app screens (web) and push notifications (shared, used by the backend). */
export const CATALOGUES = [
  { name: "web", dir: "web/src/i18n" },
  { name: "push", dir: "shared/i18n" },
] as const;

export const DRAFT_LANGUAGES = ["kn", "hi"] as const;

export function read(path: string): Catalogue {
  return JSON.parse(readFileSync(path, "utf8")) as Catalogue;
}

/** One entry per line, so reviewers and diffs see exactly which sentence changed. */
export function write(path: string, catalogue: Catalogue): void {
  const entries = Object.entries(catalogue.strings);
  const lines = [
    "{",
    `  "_meta": ${JSON.stringify(catalogue._meta)},`,
    '  "strings": {',
    ...entries.map(([key, entry], i) => `    ${JSON.stringify(key)}: ${JSON.stringify({ text: entry.text, reviewedBy: entry.reviewedBy })}${i < entries.length - 1 ? "," : ""}`),
    "  }",
    "}",
    "",
  ];
  writeFileSync(path, lines.join("\n"));
}

/** RFC 4180 CSV, which Google Sheets and Excel open and save without mangling Kannada or Devanagari. */
export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
