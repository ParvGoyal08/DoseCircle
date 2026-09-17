import type { DoseStatus, MissClass, SlotName } from "@dosecircle/shared";
import { CircleCheck, CircleDashed, Clock, HeartPulse, Hand, Moon, Sun, Sunrise, Sunset, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { TFunction } from "i18next";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Tone = "ink" | "taken" | "claimed" | "quiet" | "danger" | "haldi";

const TONES: Record<Tone, string> = {
  ink: "bg-ink text-paper hover:bg-ink/90 disabled:bg-ink/40",
  taken: "bg-taken text-white hover:bg-taken/92 disabled:bg-taken/40",
  claimed: "bg-claimed text-white hover:bg-claimed/92 disabled:bg-claimed/40",
  danger: "bg-missed text-white hover:bg-missed/92",
  haldi: "bg-haldi text-ink hover:bg-haldi/90",
  quiet: "bg-surface text-ink border border-line-strong hover:bg-paper",
};

export function Button({
  tone = "ink",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] font-semibold transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed",
        size === "sm" && "min-h-10 px-3.5 text-[15px]",
        size === "md" && "min-h-12 px-5 text-[17px]",
        size === "lg" && "min-h-14 px-6 text-lg",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export const SLOT_ICONS: Record<SlotName, LucideIcon> = { morning: Sunrise, afternoon: Sun, evening: Sunset, night: Moon };

interface StatusLook {
  icon: LucideIcon;
  className: string;
  labelKey: string;
}

/** Every status: colour + icon + word. Colour is never the only signal. */
export function statusLook(status: DoseStatus, missClass?: MissClass | null): StatusLook {
  switch (status) {
    case "TAKEN":
      return { icon: CircleCheck, className: "bg-taken-tint text-taken", labelKey: "status.taken" };
    case "TAKEN_LATE":
      return { icon: CircleCheck, className: "bg-taken-tint text-taken", labelKey: "status.takenLate" };
    case "CLAIMED":
      return { icon: Hand, className: "bg-claimed-tint text-claimed", labelKey: "status.claimed" };
    case "ESCALATING":
      return missClass === "OFFLINE"
        ? { icon: WifiOff, className: "bg-offline-tint text-offline", labelKey: "status.escalating" }
        : { icon: TriangleAlert, className: "bg-missed-tint text-missed", labelKey: "status.escalating" };
    case "UNRESOLVED":
      return { icon: TriangleAlert, className: "bg-missed-tint text-missed", labelKey: "status.unresolved" };
    case "SKIPPED":
      return { icon: CircleDashed, className: "bg-offline-tint text-offline", labelKey: "status.skipped" };
    default:
      return { icon: Clock, className: "bg-due-tint text-due", labelKey: "status.pending" };
  }
}

export function Pill({ icon: Icon, className, children }: { icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none", className)}>
      {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />}
      {children}
    </span>
  );
}

export function StatusPill({ status, missClass, t, lang }: { status: DoseStatus; missClass?: MissClass | null; t: TFunction; lang: string }) {
  const look = statusLook(status, missClass);
  return (
    <Pill icon={look.icon} className={look.className}>
      <span lang={lang}>{t(look.labelKey)}</span>
    </Pill>
  );
}

export function CriticalPill({ t, lang }: { t: TFunction; lang: string }) {
  return (
    <Pill icon={HeartPulse} className="bg-critical-tint text-critical">
      <span lang={lang}>{t("status.critical")}</span>
    </Pill>
  );
}

/** Initial-letter avatar with a stable warm colour; people are never shown as grey silhouettes. */
export function Avatar({ name, size = 36, ring }: { name: string; size?: number; ring?: string }) {
  const hues = ["#F4B400", "#E8A0A0", "#9CC5A1", "#A7B8E8", "#D9B38C", "#C9A7E0"];
  const hue = hues[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % hues.length];
  return (
    <span
      aria-hidden
      className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold text-ink", ring)}
      style={{ width: size, height: size, background: hue, fontSize: size * 0.42 }}
    >
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-[var(--radius-card)] border border-line bg-surface", className)}>{children}</div>;
}
