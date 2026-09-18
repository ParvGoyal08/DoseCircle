export type PushStep = "REMIND" | "NUDGE" | "ALERT" | "BROADCAST" | "STAND_DOWN" | "TOOK_LATE" | "REFILL" | "RX_READY" | "RX_CONFIRMED";

export interface PushPayload {
  /** Notification title; may contain a name (names are never inserted into regional sentences). */
  t: string;
  /** Notification body: a fixed, reviewed sentence in the recipient's language. */
  b: string;
  /** BCP 47 language of title and body, set on the notification. */
  l: string;
  doseId?: string;
  step: PushStep;
  /** Recipient id (member id or device id) — part of the signed receipt. */
  r: string;
  /** App path to open on tap. */
  url: string;
  /** "parent" shows a Taken action on Android; "family" opens the alert. */
  kind: "parent" | "family";
  /** HMAC receipt signature. */
  sig: string;
}

/**
 * Web Push allows 4096 bytes including encryption overhead (~103 bytes for aes128gcm).
 * Kannada and Hindi text is ~3 bytes per character in UTF-8, so the check is on bytes, not characters.
 */
export const MAX_PAYLOAD_BYTES = 3900;

export class PayloadTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`Push payload is ${bytes} bytes; the limit is ${MAX_PAYLOAD_BYTES}`);
  }
}

export function encodePushPayload(payload: PushPayload): string {
  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) throw new PayloadTooLargeError(bytes);
  return json;
}
