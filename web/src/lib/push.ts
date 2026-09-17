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
 * Asks for notification permission (only ever from a button tap), subscribes, and registers the
 * subscription for the parent's phone or the signed-in family member.
 */
export async function enableReminders(who: Extract<AuthKind, "device" | "family">): Promise<NotificationPermission> {
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
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const body = { subscription: { endpoint: json.endpoint, keys: json.keys } };
  await api(who === "device" ? "/parent/push/subscription" : "/push/subscriptions", { method: "POST", auth: who, body });
  return permission;
}
