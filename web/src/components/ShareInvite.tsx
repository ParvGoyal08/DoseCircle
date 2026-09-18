import { Check, Copy, MessageCircle } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { Button } from "./ui";

/**
 * How every invite is handed over: the code to read out, WhatsApp and a copy button for sending it,
 * and a QR code for when the other phone is in the room. Shared by the parent's phone pairing and
 * the family-member invite so both are equally easy — a link you can only copy is no use when the
 * person you are inviting is sitting next to you.
 */
export function ShareInvite({ link, code, message, help, lang: viewerLang }: { link: string; code: string; message: string; help: string; lang: string }) {
  const { t, lang } = useT(viewerLang);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    // Ink on white, so it scans in either theme.
    void QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: "#14133a", light: "#ffffff" } }).then((url) => live && setQr(url));
    return () => {
      live = false;
    };
  }, [link]);

  return (
    <div>
      <p lang={lang} className="text-[15px] text-muted">
        {help}
      </p>
      <p className="tabular mt-3 font-mono text-3xl font-semibold tracking-[0.2em] text-ink">{code}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${link}`)}`}
          target="_blank"
          rel="noreferrer"
          className="pressable inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-button)] bg-taken px-4 font-semibold text-white"
        >
          <MessageCircle aria-hidden className="size-5" strokeWidth={2.25} />
          <span lang={lang}>{t("onboard.shareWhatsApp")}</span>
        </a>
        <Button
          tone="quiet"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden className="size-5" /> : <Copy aria-hidden className="size-5" />}
          <span lang={lang}>{copied ? t("onboard.copied") : t("onboard.copyLink")}</span>
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        {qr ? (
          <img src={qr} alt="" className="size-32 shrink-0 rounded-lg border border-line bg-white p-1" />
        ) : (
          <div aria-hidden className="size-32 shrink-0 animate-pulse rounded-lg bg-sunken" />
        )}
        <p lang={lang} className="text-[15px] text-muted">
          {t("onboard.scanQr")}
        </p>
      </div>

      <p lang={lang} className="mt-3 text-[14px] text-muted">
        {t("onboard.codeExpires")}
      </p>
    </div>
  );
}
