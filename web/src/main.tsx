import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./i18n";
import "./styles/app.css";
import { applyTheme, initialTheme } from "./components/ThemeToggle";

applyTheme(initialTheme());

// The service worker receives push reminders and posts delivery receipts; production builds only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  /*
   * New versions take over by themselves. The worker precaches the app, so until a new worker is
   * active every visit is served the old build — and a new worker used to wait until every tab and
   * the installed app were fully closed, which on a phone is roughly never. Fixes did not reach the
   * people using the app. Now a waiting worker is told to activate, and the page reloads onto it:
   * at once if it has only just opened, otherwise the next time it goes out of sight, so nobody
   * loses what they were typing. The very first install has nothing to replace and never reloads.
   */
  const hadController = Boolean(navigator.serviceWorker.controller);
  const openedAt = Date.now();
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    if (Date.now() - openedAt < 15_000 || document.visibilityState === "hidden") reload();
    else document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && reload());
  });
  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const activate = (worker: ServiceWorker | null) => worker && navigator.serviceWorker.controller && worker.postMessage("SKIP_WAITING");
    activate(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => worker.state === "installed" && activate(worker));
    });
    // An installed app can stay open for days: look for a new version whenever it comes back into view.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void registration.update().catch(() => undefined));
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
