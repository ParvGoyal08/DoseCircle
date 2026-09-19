import { BatteryFull, Signal, Wifi, WifiOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { formatTime } from "../lib/format";
import { cx } from "./ui";

/** A phone outline for the demo, so three people's screens can be seen side by side. */
export function PhoneFrame({ children, offline = false, label, className, height = 680, clock }: { children: ReactNode; offline?: boolean; label?: ReactNode; className?: string; height?: number; /** A fixed time for the status bar, e.g. in a story set at 8:00. */ clock?: string }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <figure className={cx("flex flex-col items-center gap-3", className)}>
      <div className="relative w-full max-w-[340px] rounded-[48px] bg-[#16211e] p-[10px] shadow-[0_30px_60px_-30px_rgb(31_63_55/0.55),0_0_0_1px_rgb(255_255_255/0.06)_inset]">
        <div className="relative flex flex-col overflow-hidden rounded-[38px] bg-paper" style={{ height }}>
          <div className="flex h-11 shrink-0 items-center justify-between px-7 text-[13px] font-semibold text-ink">
            <span className="tabular">{clock ?? formatTime(now, "en-IN").replace(/\s?[ap]m$/i, "")}</span>
            <span aria-hidden className="absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
            <span className="flex items-center gap-1">
              {offline ? <WifiOff className="size-3.5 text-missed" strokeWidth={2.5} /> : <Signal className="size-3.5" strokeWidth={2.5} />}
              {!offline && <Wifi className="size-3.5" strokeWidth={2.5} />}
              <BatteryFull className="size-4" strokeWidth={2} />
            </span>
          </div>
          <div className="relative min-h-0 flex-1">{children}</div>
        </div>
      </div>
      {label && <figcaption className="text-center">{label}</figcaption>}
    </figure>
  );
}

export interface BannerNotification {
  id: string;
  title: string;
  body: string;
  lang: string;
  /** "now" in the reader's language. */
  nowLabel: string;
}

/** An OS-style notification sliding in at the top of the phone. Tapping it opens the related screen. */
export function NotificationBanner({ notification, onOpen, onDismiss }: { notification: BannerNotification | null; onOpen: () => void; onDismiss: () => void }) {
  const reduceMotion = useReducedMotion();
  const id = notification?.id;
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div className="pointer-events-none absolute inset-x-2 top-1 z-30">
      <AnimatePresence>
        {notification && (
          <motion.button
            key={notification.id}
            type="button"
            onClick={onOpen}
            initial={reduceMotion ? { opacity: 0 } : { y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: -90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-[22px] bg-surface/95 p-3 text-left shadow-[0_12px_32px_-12px_rgb(31_63_55/0.35)] ring-1 ring-line backdrop-blur"
          >
            <img src="/icons/favicon.svg" alt="" className="mt-0.5 size-9 rounded-[10px]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span lang={notification.lang} className="truncate text-[15px] font-semibold text-ink">
                  {notification.title}
                </span>
                <span lang={notification.lang} className="shrink-0 text-xs text-muted">
                  {notification.nowLabel}
                </span>
              </span>
              <span lang={notification.lang} className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-ink">
                {notification.body}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
