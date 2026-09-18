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
    // What a screen actually renders: the language is chosen by displayLanguage, then looked up.
    // Every catalogue is loaded in full, so this is the only thing keeping a draft off a real screen.
    const rendered = (lang: string) => i18next.getFixedT(displayLanguage(lang))("parent.takenButton");
    expect(rendered("kn")).toBe(isFullyReviewed("kn") ? kn.strings["parent.takenButton"].text : en.strings["parent.takenButton"].text);
    expect(rendered("hi")).toBe(isFullyReviewed("hi") ? hi.strings["parent.takenButton"].text : en.strings["parent.takenButton"].text);
  });

  it("shows a draft only where it is asked for by name", () => {
    // The landing page illustrates three scripts side by side and labels them as drafts; nothing a
    // parent or family member acts on passes this flag.
    expect(displayLanguage("kn", true)).toBe("kn");
    expect(i18next.getFixedT(displayLanguage("kn", true))("parent.takenButton")).toBe(kn.strings["parent.takenButton"].text);
    // An opt-in cannot conjure a language we do not ship at all.
    expect(displayLanguage("ta", true)).toBe("en");
    expect(displayLanguage("xx", true)).toBe("en");
  });

  it("never splices names or numbers into sentences", () => {
    for (const catalogue of [en, kn, hi]) for (const { text } of Object.values(catalogue.strings)) expect(text).not.toMatch(/\{\{|\}\}/);
  });

  it("marks every unreviewed language it offers as a draft", () => {
    // Drafts are offered in production at the moment (VITE_SHOW_DRAFT_LANGUAGES), so the one thing
    // that must hold is that nothing unreviewed is ever presented as finished.
    for (const language of pickerLanguages()) expect(language.draft).toBe(!isFullyReviewed(language.code));
    expect(pickerLanguages().find((l) => l.code === "en")?.draft).toBe(false);
  });
});

describe("language gate with drafts offered", async () => {
  // A second module instance with the switch on, which is how the deployed app is configured.
  vi.resetModules();
  vi.doMock("../src/lib/config", () => ({ config: { apiUrl: "https://api.example", showDraftLanguages: true }, isSimulated: false }));
  const drafts = await import("../src/i18n");

  it("offers Kannada and Hindi, each labelled as a draft", () => {
    const offered = drafts.pickerLanguages();
    expect(offered.map((l) => l.code).sort()).toEqual(["en", "hi", "kn"]);
    expect(offered.find((l) => l.code === "kn")).toMatchObject({ draft: true, endonym: "ಕನ್ನಡ" });
    expect(offered.find((l) => l.code === "hi")).toMatchObject({ draft: true, endonym: "हिन्दी" });
    expect(offered.find((l) => l.code === "en")?.draft).toBe(false);
  });

  it("renders those languages rather than quietly falling back to English", () => {
    expect(drafts.displayLanguage("kn")).toBe("kn");
    expect(drafts.displayLanguage("hi")).toBe("hi");
    // A language with no catalogue at all is still English, switch or no switch.
    expect(drafts.displayLanguage("ta")).toBe("en");
  });
});
