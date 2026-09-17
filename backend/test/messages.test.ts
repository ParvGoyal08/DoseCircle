import { describe, expect, it } from "vitest";
import en from "../../shared/i18n/en.json" with { type: "json" };
import { message, messageLanguage } from "../src/lib/messages.js";

const strings = (en as { strings: Record<string, { text: string }> }).strings;

describe("push strings", () => {
  it("are whole sentences, so no name or number is ever spliced into a translation", () => {
    for (const [key, { text }] of Object.entries(strings)) {
      if (key.includes(".title.")) continue;
      expect(text, key).toMatch(/^[A-Z]/);
      expect(text, key).toMatch(/[.!?]$/);
      expect(text, key).not.toMatch(/\{|\}|%s/);
    }
  }); 

  it("fall back to English, never another Indian language", () => {
    expect(message("kn", "push.remind.body")).toBe(strings["push.remind.body"]!.text);
    expect(messageLanguage("kn", "push.remind.body")).toBe("en");
    expect(messageLanguage("xx", "push.remind.body")).toBe("en");
  });
});
