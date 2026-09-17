import { canMarkTaken } from "@dosecircle/shared";
import { Check, HeartPulse, Undo2, Utensils, Volume2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { formatCount, formatTime } from "../lib/format";
import type { DoseView } from "../lib/types";
import { cx, SLOT_ICONS } from "./ui";

export const UNDO_SECONDS = 10;

type Phase = "ready" | "undo" | "sent" | "closed";

function initialPhase(status: DoseView["status"]): Phase {
  if (status === "TAKEN" || status === "TAKEN_LATE") return "sent";
  return canMarkTaken(status) ? "ready" : "closed";
}

/** Plays a fixed voice phrase if a reviewed clip exists for this language; otherwise the button stays hidden. */
function useVoiceClip(src: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = new Audio();
    element.preload = "auto";
    const onReady = () => setAvailable(true);
    const onMissing = () => setAvailable(false);
    const onPlay = () => setPlaying(true);
    const onStop = () => setPlaying(false);
    element.addEventListener("canplaythrough", onReady);
    element.addEventListener("error", onMissing);
    element.addEventListener("play", onPlay);
    element.addEventListener("ended", onStop);
    element.addEventListener("pause", onStop);
    element.src = src;
    audio.current = element;
    return () => {
      element.pause();
      element.removeEventListener("canplaythrough", onReady);
      element.removeEventListener("error", onMissing);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("ended", onStop);
      element.removeEventListener("pause", onStop);
    };
  }, [src]);

  const play = useCallback(() => {
    const element = audio.current;
    if (!element) return;
    element.currentTime = 0;
    // Autoplay may be refused (always on iOS); the Listen button stays visible either way.
    element.play().catch(() => setPlaying(false));
  }, []);

  return { available, playing, play };
}

export interface ParentDoseScreenProps {
  dose: DoseView;
  /** Records Taken on the server. `keepalive` is set when the page is closing during the undo window. */
  onTaken: (options: { keepalive: boolean }) => Promise<void>;
  /** Try to play the reminder phrase when the screen opens (installed Android apps usually allow it). */
  autoPlay?: boolean;
  /** Inside the demo's phone frame the layout is slightly tighter. */
  framed?: boolean;
}

/**
 * The parent's one job: confirm the dose. One screen, one action, very large type, in their own language.
 * Undo happens on the phone for 10 seconds before anything is sent, because a completed workflow step
 * cannot be taken back on the server.
 */
export function ParentDoseScreen({ dose, onTaken, autoPlay = false, framed = false }: ParentDoseScreenProps) {
  const { t, lang } = useT(dose.parent.lang);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(dose.status));
  const [secondsLeft, setSecondsLeft] = useState(UNDO_SECONDS);
  const [lateConfirmation, setLateConfirmation] = useState(dose.status === "TAKEN_LATE");
  const [failed, setFailed] = useState(false);
  const statusAtTap = useRef(dose.status);
  const sent = useRef(false);

  const reminder = useVoiceClip(dose.voice.src);
  const thanks = useVoiceClip(dose.voice.thanks);

  useEffect(() => {
    if (autoPlay && phase === "ready" && reminder.available) reminder.play();
    // Only when the clip first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder.available]);

  // The workflow may close the dose while the screen is open (e.g. someone else resolved it).
  useEffect(() => {
    if (phase === "ready" && !canMarkTaken(dose.status)) setPhase(initialPhase(dose.status));
  }, [dose.status, phase]);

  const send = useCallback(
    async (keepalive: boolean) => {
      if (sent.current) return;
      sent.current = true;
      try {
        await onTaken({ keepalive });
        setLateConfirmation(statusAtTap.current === "ESCALATING" || statusAtTap.current === "CLAIMED");
        setPhase("sent");
        setFailed(false);
      } catch {
        sent.current = false;
        setFailed(true);
        setPhase("ready");
      }
    },
    [onTaken],
  );

  useEffect(() => {
    if (phase !== "undo") return;
    if (secondsLeft <= 0) {
      void send(false);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, secondsLeft, send]);

  // Closing the app during the undo window still records the dose.
  useEffect(() => {
    if (phase !== "undo") return;
    const flush = () => void send(true);
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, send]);

  const tapTaken = () => {
    statusAtTap.current = dose.status;
    setSecondsLeft(UNDO_SECONDS);
    setPhase("undo");
    if (thanks.available) thanks.play();
    navigator.vibrate?.(40);
  };

  const pad = framed ? "px-5" : "px-6";
  const SlotIcon = SLOT_ICONS[dose.slotName];

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-paper">
      <div className="flex-1 overflow-y-auto pb-4">
        <header className={cx("hero-surface relative overflow-hidden", framed ? "px-5 pb-5 pt-4" : "px-6 pb-7 pt-8")}>
          <div aria-hidden className="hero-grid absolute inset-0" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={cx("grid shrink-0 place-items-center rounded-2xl bg-haldi text-[#14133a]", framed ? "size-12" : "size-14")}>
                <SlotIcon aria-hidden className={framed ? "size-6" : "size-7"} strokeWidth={2.25} />
              </span>
              <div>
                <h1 lang={lang} className={cx("font-semibold leading-tight tracking-tight text-white", framed ? "text-[28px]" : "text-[36px]")}>
                  {t(`slot.${dose.slotName}`)}
                </h1>
                <p className="tabular text-lg font-medium text-hero-muted">{formatTime(dose.scheduledAt, lang)}</p>
              </div>
            </div>
            {reminder.available && phase === "ready" && (
              <button type="button" onClick={reminder.play} className="pressable inline-flex min-h-14 items-center gap-2 rounded-full bg-white/12 px-4 text-lg font-semibold text-white ring-1 ring-white/25">
                <Volume2 aria-hidden className={cx("size-6", reminder.playing && "animate-pulse")} strokeWidth={2.25} />
                <span lang={lang}>{t("parent.listen")}</span>
              </button>
            )}
          </div>
        </header>
        <div className={pad}>
        <p lang={lang} className={cx("mt-4 font-semibold text-ink", framed ? "text-xl" : "text-[22px]")}>
          {t(`parent.prompt.${dose.slotName}`)}
        </p>

        {dose.critical && phase === "ready" && (
          <p lang={lang} className="mt-4 flex items-start gap-3 rounded-2xl bg-critical-tint p-4 text-lg font-semibold text-critical">
            <HeartPulse aria-hidden className="mt-1 size-6 shrink-0" strokeWidth={2.25} />
            {t("parent.important")}
          </p>
        )}

        <ul className="mt-5 space-y-3">
          {dose.medicines.map((medicine) => (
            <li key={medicine.medId} className={cx("sticker flex items-center bg-surface", framed ? "gap-3 p-3" : "gap-4 p-4")}>
              <span
                aria-label={medicine.count === null ? undefined : String(medicine.count)}
                className={cx("tabular grid shrink-0 place-items-center rounded-2xl bg-haldi font-semibold text-[#14133a]", framed ? "size-13 text-[28px]" : "size-16 text-[32px]")}
              >
                {formatCount(medicine.count)}
              </span>
              <div className="min-w-0">
                {/* Names stay exactly as printed on the strip, in Latin script, never translated. */}
                <p lang="en" className={cx("medicine-name font-semibold text-ink", framed ? "text-2xl" : "text-[30px]")}>
                  {medicine.nameAsPrinted}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg text-muted">
                  {medicine.strength && (
                    <span lang="en" className="medicine-name">
                      {medicine.strength}
                    </span>
                  )}
                  {medicine.food && (
                    <span className="inline-flex items-center gap-1.5">
                      <Utensils aria-hidden className="size-4" strokeWidth={2.25} />
                      <span lang={lang}>{t(`parent.food.${medicine.food}`)}</span>
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
        </div>
      </div>

      <div className={cx("safe-bottom border-t border-line bg-surface pt-4", pad)}>
        <AnimatePresence mode="wait" initial={false}>
          {phase === "ready" && (
            <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {failed && (
                <p lang={lang} role="alert" className="mb-3 text-lg font-medium text-missed">
                  {t("common.error")}
                </p>
              )}
              <button
                type="button"
                onClick={tapTaken}
                className={cx(
                  "pressable flex w-full flex-col items-center justify-center gap-2 rounded-[22px] bg-taken px-4 text-white shadow-[0_12px_28px_-12px_rgb(3_87_63/0.7)]",
                  framed ? "min-h-32" : "min-h-40",
                )}
              >
                <span className="grid size-12 place-items-center rounded-full bg-white/18 text-white">
                  <Check aria-hidden className="size-8" strokeWidth={3} />
                </span>
                <span lang={lang} className={cx("font-semibold leading-tight", framed ? "text-2xl" : "text-[28px]")}>
                  {t("parent.takenButton")}
                </span>
              </button>
            </motion.div>
          )}

          {(phase === "undo" || phase === "sent") && (
            <motion.div
              key="done"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cx("flex flex-col items-center rounded-[22px] bg-taken-tint px-4 py-5 text-center", framed ? "min-h-32" : "min-h-40")}
              role="status"
            >
              <TickMark />
              <p lang={lang} className="mt-2 text-2xl font-semibold text-taken">
                {t("parent.takenThanks")}
              </p>
              {phase === "sent" && lateConfirmation && (
                <p lang={lang} className="mt-1 text-lg text-ink">
                  {t("parent.familyToldTaken")}
                </p>
              )}
              {phase === "undo" && (
                <button
                  type="button"
                  onClick={() => setPhase("ready")}
                  className="pressable mt-3 inline-flex min-h-14 items-center gap-3 rounded-full border border-line-strong bg-surface pl-2 pr-5 text-lg font-semibold text-ink"
                >
                  <CountdownRing seconds={secondsLeft} total={UNDO_SECONDS} />
                  <Undo2 aria-hidden className="size-5" strokeWidth={2.5} />
                  <span lang={lang}>{t("parent.undo")}</span>
                </button>
              )}
            </motion.div>
          )}

          {phase === "closed" && (
            <motion.p key="closed" lang={lang} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] bg-offline-tint px-4 py-6 text-center text-xl font-semibold text-offline">
              {t("parent.alreadyClosed")}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TickMark() {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 52 52" className="size-14" aria-hidden>
      <motion.circle cx="26" cy="26" r="24" fill="var(--color-taken)" initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }} />
      <motion.path
        d="M15 27 l7 7 l15 -16"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, delay: 0.12, ease: "easeOut" }}
      />
    </svg>
  );
}

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-10 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - seconds / total)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span className="tabular text-sm font-semibold">{Math.max(seconds, 0)}</span>
    </span>
  );
}
