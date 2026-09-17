/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

// Every app route is the single-page app, so it opens offline too.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// Voice clips never change for a given path; keep them so "Listen" works without a connection.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/audio/"),
  new CacheFirst({ cacheName: "voice-clips", plugins: [new ExpirationPlugin({ maxEntries: 60 })] }),
);

// A replaced subscription is re-registered by the app on its next launch (lib/push.ts): the
// service worker has no credentials of its own to call the API with.
self.addEventListener("pushsubscriptionchange", (event) => {
  (event as ExtendableEvent).waitUntil(
    self.registration.showNotification("DoseCircle", {
      body: "Please open DoseCircle once so reminders keep working.",
      icon: "/icons/icon-192.png",
      tag: "subscription-change",
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

/** Mirrors backend/src/lib/push-payload.ts. */
interface PushPayload {
  t: string;
  b: string;
  l: string;
  doseId?: string;
  step: string;
  r: string;
  url: string;
  kind: "parent" | "family";
  sig: string;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

self.addEventListener("push", (event) => {
  let payload: PushPayload | null = null;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    payload = null;
  }

  // Every push must show a notification, or Safari withdraws permission.
  const title = payload?.t || "DoseCircle";
  const shown = self.registration.showNotification(title, {
    body: payload?.b ?? "",
    lang: payload?.l,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload?.doseId ? `${payload.doseId}:${payload.kind}` : undefined,
    // A newer step for the same dose replaces the old notification but still alerts.
    renotify: Boolean(payload?.doseId),
    requireInteraction: payload?.kind === "parent",
    data: { url: payload?.url ?? "/" },
  } as NotificationOptions);

  // The receipt is what lets the workflow tell "reached the phone" from "phone offline",
  // so it is sent the moment the push arrives, before anyone taps.
  const receipt =
    payload?.doseId && payload.sig && API_URL
      ? fetch(`${API_URL}/push/receipt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ doseId: payload.doseId, step: payload.step, recipient: payload.r, sig: payload.sig }),
          keepalive: true,
        }).catch(() => undefined)
      : Promise.resolve(undefined);

  event.waitUntil(Promise.all([shown, receipt]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url ?? "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await (client as WindowClient).navigate(target.href);
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
