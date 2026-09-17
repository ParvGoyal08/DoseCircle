import { describe, expect, it } from "vitest";
import { signDemoToken, verifyDemoToken } from "../src/lib/demo-jwt.js";

describe("demo tokens", () => {
  const now = 1_800_000_000;
  const claims = { kind: "demo" as const, sid: "s1", fid: "demo-s1", gen: 1, exp: now + 3600 };

  it("round-trips valid claims", () => {
    expect(verifyDemoToken("secret", signDemoToken("secret", claims), now)).toEqual(claims);
  });

  it("rejects wrong secrets, tampering and expiry", () => {
    const token = signDemoToken("secret", claims);
    expect(verifyDemoToken("other", token, now)).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, fid: "demo-other" })).toString("base64url");
    expect(verifyDemoToken("secret", `${h}.${forged}.${s}`, now)).toBeNull();
    expect(verifyDemoToken("secret", token, now + 7200)).toBeNull();
  });

  it("never accepts a token for a real family", () => {
    const real = signDemoToken("secret", { ...claims, fid: "fam-1" });
    expect(verifyDemoToken("secret", real, now)).toBeNull();
  });
});
