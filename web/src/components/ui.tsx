import type { DoseStatus, MissClass, SlotName } from "@dosecircle/shared";
import { CircleCheck, CircleDashed, Clock, HeartPulse, Hand, Moon, Sun, Sunrise, Sunset, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { TFunction } from "i18next";
import { InitialBadge } from "./illustrations/Characters";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Tone = "ink" | "taken" | "claimed" | "quiet" | "danger" | "haldi";

const TONES: Record<Tone, string> = {
  ink: "bg-ink text-paper disabled:bg-ink/40 disabled:shadow-none",
  taken: "bg-taken text-white disabled:opacity-50",
  claimed: "bg-claimed text-white disabled:opacity-50",
  danger: "bg-missed text-white",
  haldi: "bg-haldi text-ink disabled:opacity-50",
  quiet: "bg-surface text-ink disabled:opacity-50",
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
        "pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] border-2 border-ink font-bold shadow-[3px_3px_0_var(--color-ink)] disabled:cursor-not-allowed disabled:shadow-none",
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
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-2.5 py-1 text-[13px] font-bold leading-none", className)}>
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

/** Initial badge for real people; the demo family has drawn characters instead. */
export function Avatar({ name, size = 36 }: { name: string; size?: number; ring?: string }) {
  return <InitialBadge name={name} size={size} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("sticker bg-surface", className)}>{children}</div>;
}
