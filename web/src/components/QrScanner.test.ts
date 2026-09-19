import { describe, expect, it } from "vitest";
import { dosecircleTarget } from "./QrScanner";

describe("reading a scanned code", () => {
  it("opens the parent's join screen from the family's link, keeping the language", () => {
    expect(dosecircleTarget("https://main.d38ff1sjrywo9e.amplifyapp.com/join#c=K7Q4M2XP&l=kn")).toBe("/join#c=K7Q4M2XP&l=kn");
  });

  it("opens a family member's invite", () => {
    expect(dosecircleTarget("https://main.d38ff1sjrywo9e.amplifyapp.com/invite#c=AB12CD34")).toBe("/invite#c=AB12CD34");
  });

  it("accepts a bare code, with or without a dash or lower case", () => {
    expect(dosecircleTarget("k7q4-m2xp")).toBe("/join#c=K7Q4M2XP");
  });

  it("never follows the link itself: only the code is kept, on our own address", () => {
    expect(dosecircleTarget("https://evil.example/join#c=K7Q4M2XP&l=kn")).toBe("/join#c=K7Q4M2XP&l=kn");
    expect(dosecircleTarget("https://example.com/join#c=K7Q4M2XP&l=<script>")).toBe("/join#c=K7Q4M2XP");
  });

  it("ignores anything that isn't a DoseCircle code", () => {
    expect(dosecircleTarget("https://example.com/menu")).toBeNull();
    expect(dosecircleTarget("https://example.com/home#c=K7Q4M2XP")).toBeNull();
    expect(dosecircleTarget("https://example.com/join#c=ABC")).toBeNull();
    expect(dosecircleTarget("WIFI:S:Home;T:WPA;P:secret;;")).toBeNull();
    expect(dosecircleTarget("DOSECIRCLE-SAMPLE-K7Q4M2XP")).toBeNull();
  });
});
