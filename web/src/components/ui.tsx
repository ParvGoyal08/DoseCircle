import type { DoseStatus, MissClass, SlotName } from "@dosecircle/shared";
import { CircleCheck, CircleDashed, Clock, HeartPulse, Hand, Moon, Sun, Sunrise, Sunset, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { TFunction } from "i18next";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Tone = "ink" | "taken" | "claimed" | "quiet" | "danger" | "haldi" | "ghost";

/** Primary actions are sage green with white text (7.4:1); gold buttons always carry dark text (7.4:1). */
const TONES: Record<Tone, string> = {
  ink: "bg-indigo text-white shadow-[0_8px_20px_-12px_rgb(31_63_55/0.55)] hover:bg-indigo-deep disabled:opacity-40",
  taken: "bg-taken text-white hover:brightness-110 disabled:opacity-40",
  claimed: "bg-claimed text-white hover:brightness-110 disabled:opacity-40 dark:bg-claimed-fill",
  danger: "bg-missed text-white hover:brightness-110",
  haldi: "bg-haldi text-[#172b2a] hover:brightness-105 shadow-[0_8px_20px_-12px_rgb(160_120_40/0.55)] disabled:opacity-60 disabled:shadow-none",
  quiet: "border border-line-strong bg-surface text-ink hover:bg-sunken disabled:opacity-40",
  ghost: "text-ink hover:bg-sunken disabled:opacity-40",
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
        "pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] font-semibold disabled:cursor-not-allowed",
        size === "sm" && "min-h-10 px-3.5 text-[15px]",
        size === "md" && "min-h-12 px-5 text-[16px]",
        size === "lg" && "min-h-14 px-6 text-[17px]",
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

const AVATAR_TONES = [
  "bg-indigo-tint text-indigo dark:text-white",
  "bg-haldi-tint text-haldi-deep",
  "bg-taken-tint text-taken",
  "bg-claimed-tint text-claimed",
  "bg-critical-tint text-critical",
];

/** Initials in a soft tinted circle; the colour is stable per name. */
export function Avatar({ name, size = 36, ring, className }: { name: string; size?: number; ring?: string; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold", tone, ring, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("sticker bg-surface", className)}>{children}</div>;
}
