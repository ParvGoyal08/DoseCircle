import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Crockford base32: no I, L, O or U, so codes read aloud over a phone call aren't confused. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** 8-character invite code (40 bits). Only its hash is stored. */
export function newInviteCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += CROCKFORD[byte % 32];
  return code;
}

/** Normalise what a person typed: case-insensitive, ignore spaces/dashes, map look-alike letters. */
export function normaliseInviteCode(typed: string): string {
  return typed
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** Long-lived parent device credential: 256 random bits. Only its hash is stored. */
export function newDeviceToken(): string {
  return `dt_${randomBytes(32).toString("base64url")}`;
}

export function isDeviceTokenShape(value: string): boolean {
  return /^dt_[A-Za-z0-9_-]{43}$/.test(value);
}

/** Signs push receipts so the service worker needs no credentials and receipts can't be forged. */
export function signReceipt(secret: string, doseId: string, step: string, recipient: string): string {
  return createHmac("sha256", secret).update(`${doseId}|${step}|${recipient}`, "utf8").digest("base64url");
}

export function verifyReceipt(secret: string, doseId: string, step: string, recipient: string, signature: string): boolean {
  const expected = Buffer.from(signReceipt(secret, doseId, step, recipient));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Web Push `Topic` header: at most 32 URL-safe base64 characters.
 * A newer message with the same topic replaces an undelivered older one.
 */
export function pushTopic(doseId: string, step: string): string {
  return createHash("sha256").update(`${doseId}|${step}`, "utf8").digest("base64url").slice(0, 32);
}
