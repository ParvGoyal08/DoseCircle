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

/** The endpoint we last registered, so a replaced subscription can be spotted on the next launch. */
const ENDPOINT_KEY = "dosecircle.push.endpoint";
const PATHS = { device: "/parent/push/subscription", family: "/push/subscriptions" } as const;

type Who = Extract<AuthKind, "device" | "family">;

async function register(subscription: PushSubscription, who: Who): Promise<void> {
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api(PATHS[who], { method: "POST", auth: who, body: { subscription: { endpoint: json.endpoint, keys: json.keys } } });
  try {
    localStorage.setItem(ENDPOINT_KEY, json.endpoint);
  } catch {
    // Without storage we simply register again on the next launch.
  }
}

/**
 * Browsers may replace a push subscription at any time (after an update, or when Chrome rotates it),
 * and the old endpoint then goes dead: reminders stop with nothing on screen to say so. So on every
 * launch, once permission is granted, the current subscription is compared with the one we last
 * registered and re-sent if it has changed.
 */
export async function keepSubscriptionFresh(who: Who): Promise<void> {
  if (mockApiEnabled || pushSupport() !== "supported" || Notification.permission !== "granted" || !config.vapidPublicKey) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) }));
    const endpoint = (subscription.toJSON() as { endpoint: string }).endpoint;
    if (localStorage.getItem(ENDPOINT_KEY) === endpoint) return;
    await register(subscription, who);
  } catch {
    // Not fatal: the family can turn reminders on again from the app.
  }
}

/**
 * Asks for notification permission (only ever from a button tap), subscribes, and registers the
 * subscription for the parent's phone or the signed-in family member.
 */
export async function enableReminders(who: Who): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  // The local preview has no service worker or push keys; permission alone is enough to try the flow.
  if (mockApiEnabled) return permission;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error("Reminders need the installed app. Please reload the page and try again.");
  if (!config.vapidPublicKey) throw new Error("Reminders are not configured for this copy of the app.");
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) }));
  await register(subscription, who);
  return permission;
}
