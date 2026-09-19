import { Keyboard, Loader2, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useT } from "../i18n";

/**
 * Reads the family's QR code with this device's camera and goes straight into joining.
 *
 * Pointing the phone's own camera app at the code works too, but it opens the link in the browser,
 * not in DoseCircle when DoseCircle is installed — and an installed app is where reminders should
 * land. So the app can scan for itself.
 *
 * Only the code is taken from what is scanned. The app builds its own /join or /invite address from
 * it and never follows whatever link a QR code happens to hold.
 */
export function QrScanner({ lang: viewerLang, onClose, onFound }: { lang: string; onClose: () => void; /** Instead of navigating: for a screen that is already the destination. */ onFound?: (target: string) => void }) {
  const { t, lang } = useT(viewerLang);
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "noCamera">("starting");
  const [notOurs, setNotOurs] = useState(false);
  // Held in refs so the camera starts once: screens pass inline callbacks, and depending on them
  // would stop and restart the camera every time the page behind re-rendered.
  const callbacks = useRef({ onClose, onFound, navigate });
  callbacks.current = { onClose, onFound, navigate };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const found = (text: string) => {
      const target = dosecircleTarget(text);
      if (!target) {
        setNotOurs(true);
        return false;
      }
      stopped = true;
      const { onClose: close, onFound: foundIt, navigate: go } = callbacks.current;
      close();
      if (foundIt) foundIt(target);
      else go(target);
      return true;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState("noCamera");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (error) {
        const name = (error as { name?: string }).name;
        return setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "noCamera");
      }
      if (stopped || !video.current) return stream.getTracks().forEach((track) => track.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      setState("scanning");

      // The browser's own detector where there is one (Chrome on Android); jsQR everywhere else,
      // loaded only now so it costs nothing for the people who never scan.
      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (stopped) return;
        const v = video.current;
        if (v && v.readyState >= 2 && v.videoWidth > 0) {
          let text: string | null = null;
          if (detector) {
            text = (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
          } else if (jsQR && context) {
            // A smaller frame reads just as well and keeps an old phone responsive.
            const scale = Math.min(1, 640 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            context.drawImage(v, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
          if (text && found(text)) return;
        }
        timer = setTimeout(() => void tick(), 180);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="scan-title" className="fixed inset-0 z-50 flex flex-col bg-[#0b1311] text-white">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 id="scan-title" lang={lang} className="text-lg font-semibold">
          {t("scan.title")}
        </h2>
        <button type="button" onClick={onClose} aria-label={t("scan.close")} className="grid size-11 place-items-center rounded-full hover:bg-white/10">
          <X aria-hidden className="size-6" />
        </button>
      </div>

      <div className="relative mx-auto mt-4 aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black">
        <video ref={video} playsInline muted className="size-full object-cover" />
        {state === "scanning" && (
          // A square to aim at, and a line moving through it so it is obvious the camera is working.
          <div aria-hidden className="pointer-events-none absolute inset-[12%] rounded-2xl ring-2 ring-white/85">
            <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-[#9fd4c2] shadow-[0_0_12px_rgb(159_212_194)]" />
          </div>
        )}
        {state === "starting" && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 aria-hidden className="size-8 animate-spin text-white/70" />
          </div>
        )}
        {(state === "denied" || state === "noCamera") && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p lang={lang} role="alert" className="text-[17px] font-medium leading-snug">
              {t(state === "denied" ? "scan.denied" : "scan.noCamera")}
            </p>
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-sm px-4 pt-5">
        <p lang={lang} className="flex items-start gap-2 text-[16px] text-white/85">
          <ScanLine aria-hidden className="mt-0.5 size-5 shrink-0" />
          {t("scan.help")}
        </p>
        {notOurs && (
          <p lang={lang} role="status" className="mt-2 text-[15px] font-medium text-amber-300">
            {t("scan.notOurs")}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate("/join");
          }}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 text-[16px] font-semibold ring-1 ring-white/20 hover:bg-white/15"
        >
          <Keyboard aria-hidden className="size-5" />
          <span lang={lang}>{t("scan.type")}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * The in-app address for a scanned DoseCircle code, or null if it isn't one.
 *
 * Accepts the family's parent link (/join#c=…&l=…), a family-member invite (/invite#c=…), or a bare
 * eight-character code. Only the code and language are kept; everything else in the QR is ignored.
 */
export function dosecircleTarget(text: string): string | null {
  const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const bare = clean(text);
  if (/^[A-Z0-9]{8}$/.test(bare) && !/[/:.#]/.test(text)) return `/join#c=${bare}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const params = new URLSearchParams(url.hash.slice(1));
  const code = clean(params.get("c") ?? "");
  if (code.length < 8) return null;
  const lang = params.get("l");
  const suffix = lang && /^[a-z]{2}$/.test(lang) ? `&l=${lang}` : "";
  if (url.pathname === "/join") return `/join#c=${code}${suffix}`;
  if (url.pathname === "/invite") return `/invite#c=${code}`;
  return null;
}
