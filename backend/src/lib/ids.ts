import { randomBytes } from "node:crypto";

/** Short random ids with a readable prefix, e.g. "fam-3f9a1c2b7d4e". Never contain "_" (dose ids use it). */
export function newId(prefix: "fam" | "m" | "p" | "med" | "chk" | "rx" | "dev" | "s"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}
