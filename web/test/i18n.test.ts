import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/config", () => ({ config: { apiUrl: "https://api.example", showDraftLanguages: false }, isSimulated: false }));

const { displayLanguage, isFullyReviewed, pickerLanguages, i18next } = await import("../src/i18n");
import en from "../src/i18n/en.json";
import hi from "../src/i18n/hi.json";
import kn from "../src/i18n/kn.json";

describe("language gate", () => {
  it("keeps every catalogue in step with the English source", () => {
    const keys = Object.keys(en.strings).sort();
    expect(Object.keys(kn.strings).sort()).toEqual(keys);
    expect(Object.keys(hi.strings).sort()).toEqual(keys);
  });

  it("offers only fully reviewed languages in production", () => {
    for (const language of pickerLanguages()) expect(isFullyReviewed(language.code)).toBe(true);
    expect(pickerLanguages().map((l) => l.code)).toContain("en");
  });

  it("falls back to English, never to another Indian language", () => {
    if (!isFullyReviewed("kn")) expect(displayLanguage("kn")).toBe("en");
    if (!isFullyReviewed("hi")) expect(displayLanguage("hi")).toBe("en");
    expect(displayLanguage("ta")).toBe("en");
    expect(displayLanguage("xx")).toBe("en");
    expect(i18next.getFixedT("kn")("parent.takenButton")).toBe(isFullyReviewed("kn") ? kn.strings["parent.takenButton"].text : en.strings["parent.takenButton"].text);
  });

  it("never splices names or numbers into sentences", () => {
    for (const catalogue of [en, kn, hi]) for (const { text } of Object.values(catalogue.strings)) expect(text).not.toMatch(/\{\{|\}\}/);
  });
});
