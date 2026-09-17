import { Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { isIos, isStandalone } from "../lib/push";
import { Button } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
});

/**
 * Installing matters on both platforms: iOS only delivers web push to Home Screen apps, and Chrome may
 * withdraw notification permission from sites that are not installed and rarely opened.
 */
export function InstallGuide({ lang: viewerLang, code }: { lang: string; code?: string }) {
  const { t, lang } = useT(viewerLang);
  const [installed, setInstalled] = useState(isStandalone());
  const [canPrompt, setCanPrompt] = useState(Boolean(deferredPrompt));

  useEffect(() => {
    const onPrompt = () => setCanPrompt(true);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    if ((await deferredPrompt.userChoice).outcome === "accepted") setInstalled(true);
    deferredPrompt = null;
    setCanPrompt(false);
  };

  return (
    <section className="sticker bg-surface p-5">
      <h2 lang={lang} className="text-2xl font-semibold leading-snug">
        {t("install.title")}
      </h2>
      <p lang={lang} className="mt-2 text-lg text-ink">
        {t("install.why")}
      </p>

      {isIos() ? (
        <ol className="mt-4 space-y-3">
          {[
            { icon: Share, key: "install.ios.step1" },
            { icon: SquarePlus, key: "install.ios.step2" },
            { icon: Download, key: "install.ios.step3" },
          ].map(({ icon: Icon, key }, index) => (
            <li key={key} className="sticker-sm flex items-start gap-3 bg-surface p-3">
              <span className="tabular grid size-9 shrink-0 place-items-center rounded-full bg-ink text-lg font-semibold text-paper">{index + 1}</span>
              <Icon aria-hidden className="mt-1.5 size-6 shrink-0 text-claimed" strokeWidth={2.25} />
              <span lang={lang} className="text-lg leading-snug">
                {t(key)}
              </span>
            </li>
          ))}
        </ol>
      ) : canPrompt ? (
        <Button tone="ink" size="lg" className="mt-4 w-full" onClick={install}>
          <Download aria-hidden className="size-5" strokeWidth={2.5} />
          <span lang={lang}>{t("install.android.button")}</span>
        </Button>
      ) : (
        <p lang={lang} className="mt-4 rounded-xl bg-surface p-3 text-lg">
          {t("install.android.manual")}
        </p>
      )}

      {code && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-3">
          <p lang={lang} className="text-[15px] text-muted">
            {t("install.keepCode")}
          </p>
          <p className="tabular mt-1 font-mono text-3xl font-semibold tracking-[0.2em]">{code}</p>
        </div>
      )}
    </section>
  );
}
