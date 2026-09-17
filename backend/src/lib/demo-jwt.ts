import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 tokens for anonymous demo sessions. They never grant access to a real family:
 * the claims carry a demo- family id and the data layer rejects demo principals elsewhere.
 */
export interface DemoClaims {
  kind: "demo";
  sid: string;
  fid: string;
  gen: number;
  /** Expiry, epoch seconds. */
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

export function signDemoToken(secret: string, claims: DemoClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${HEADER}.${payload}`).digest("base64url");
  return `${HEADER}.${payload}.${signature}`;
}

export function verifyDemoToken(secret: string, token: string, nowSeconds = Math.floor(Date.now() / 1000)): DemoClaims | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature || header !== HEADER) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DemoClaims;
    if (claims.kind !== "demo" || !claims.fid.startsWith("demo-") || claims.exp <= nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}
