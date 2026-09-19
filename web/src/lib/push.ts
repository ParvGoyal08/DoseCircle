import { api, mockApiEnabled, type AuthKind } from "./api";
import { config } from "./config";

export type PushSupport = "supported" | "needs-install" | "unsupported";

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** iOS only delivers web push to apps added to the Home Screen. */
export function pushSupport(): PushSupport {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "needs-install";
  return "supported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Which push endpoint was last registered for which person on this browser.
 *
 * It used to be one endpoint per browser. A browser that had granted permission for one account, then
 * signed in to another — or a phone paired again — kept the same endpoint, so the check below saw
 * "already registered" and never registered it for the new person. The screen said reminders were on
 * and nothing was ever sent. Now it is remembered per person: the member id, or the phone pairing.
 */
const REGISTERED_KEY = "dosecircle.push.registered";
const PATHS = { device: "/parent/push/subscription", family: "/push/subscriptions" } as const;

type Who = Extract<AuthKind, "device" | "family">;

function registeredFor(subject: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? "{}") as Record<string, string>)[subject] ?? null;
  } catch {
    return null;
  }
}

function rememberRegistered(subject: string, endpoint: string) {
  try {
    const all = JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? "{}") as Record<string, string>;
    localStorage.setItem(REGISTERED_KEY, JSON.stringify({ ...all, [subject]: endpoint }));
  } catch {
    // Without storage we simply register again on the next launch.
  }
}

async function register(subscription: PushSubscription, who: Who, subject: string): Promise<void> {
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api(PATHS[who], { method: "POST", auth: who, body: { subscription: { endpoint: json.endpoint, keys: json.keys } } });
  rememberRegistered(subject, json.endpoint);
}

/**
 * The active service worker. `getRegistration()` returns nothing if the page is tapped before the
 * worker finished registering, which used to fail with "please reload"; `ready` waits for it. The
 * timeout covers a page where no worker was ever registered, which would otherwise wait for ever.
 */
async function activeWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000))]);
  if (!registration) throw new Error("service-worker");
  return registration;
}

async function currentSubscription(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  if (!config.vapidPublicKey) throw new Error("not-configured");
  return (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) }));
}

/**
 * Browsers may replace a push subscription at any time (after an update, or when Chrome rotates it),
 * and the old endpoint then goes dead: reminders stop with nothing on screen to say so. So on every
 * launch, once permission is granted, the current subscription is compared with the one registered
 * for this person and sent again if it differs — including when it was never sent for them at all.
 */
export async function keepSubscriptionFresh(who: Who, subject: string): Promise<void> {
  if (mockApiEnabled || pushSupport() !== "supported" || Notification.permission !== "granted" || !config.vapidPublicKey) return;
  try {
    const subscription = await currentSubscription(await activeWorker());
    if (registeredFor(subject) === subscription.endpoint) return;
    await register(subscription, who, subject);
  } catch {
    // Not fatal: the family can turn reminders on again from the app.
  }
}

/**
 * Asks for notification permission (only ever from a button tap), subscribes, and registers the
 * subscription for the parent's phone or the signed-in family member. Throws with a short code the
 * screens turn into a sentence: "service-worker", "not-configured", or the browser's own error.
 */
export async function enableReminders(who: Who, subject: string): Promise<NotificationPermission> {
  // The permission request must be the first thing after the tap: iOS refuses it otherwise.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  // The local preview has no service worker or push keys; permission alone is enough to try the flow.
  if (mockApiEnabled) return permission;
  await register(await currentSubscription(await activeWorker()), who, subject);
  return permission;
}

/** Who push registrations are remembered for: a family member, or one pairing of a parent's phone. */
export const pushSubject = {
  member: (mid: string) => `member:${mid}`,
  // The device token itself is the secret; its first characters are enough to tell pairings apart.
  device: (token: string) => `device:${token.slice(0, 12)}`,
};
