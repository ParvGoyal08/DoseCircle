import { ChevronRight, Hand, Info } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useT } from "../i18n";
import { formatAgo, formatTime } from "../lib/format";
import type { OpenAlert } from "../lib/types";
import { Avatar, Button, CriticalPill, cx, SLOT_ICONS, StatusPill } from "./ui";

export interface LadderPerson {
  mid: string;
  displayName: string;
}

export interface FamilyAlertProps {
  alert: OpenAlert;
  viewerLang: string;
  viewerMid: string;
  /** Family order for this parent, first asked first. */
  ladder: LadderPerson[];
  /** Everyone alerted so far (the ladder position reached). */
  alertedCount: number;
  onClaim: () => Promise<"claimed" | "lost">;
  onWhy: () => void;
  now?: number;
}

/**
 * The family member's alert: who, which dose, whether the phone was reachable, where the family order
 * has reached, and one button to take responsibility. Once someone claims, everyone sees who.
 */
export function FamilyAlert({ alert, viewerLang, viewerMid, ladder, alertedCount, onClaim, onWhy, now = Date.now() }: FamilyAlertProps) {
  const { t, lang } = useT(viewerLang);
  const reduceMotion = useReducedMotion();
  const [claiming, setClaiming] = useState(false);
  const [lost, setLost] = useState(false);
  const SlotIcon = SLOT_ICONS[alert.slotName];

  const claimedByMe = alert.status === "CLAIMED" && alert.claimedByName !== null && ladder.find((p) => p.mid === viewerMid)?.displayName === alert.claimedByName;
  const resolvedByParent = alert.status === "TAKEN_LATE";

  const claim = async () => {
    setClaiming(true);
    try {
      setLost((await onClaim()) === "lost");
    } finally {
      setClaiming(false);
    }
  };

  const tone = alert.status === "CLAIMED" ? "border-claimed/30" : resolvedByParent ? "border-taken/30" : alert.critical ? "border-critical/40" : alert.missClass === "OFFLINE" ? "border-offline/30" : "border-missed/30";

  return (
    <article className={cx("overflow-hidden rounded-[var(--radius-card)] border-2 bg-surface", tone)}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={alert.status} missClass={alert.missClass} t={t} lang={lang} />
          {alert.critical && <CriticalPill t={t} lang={lang} />}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Avatar name={alert.parentName} size={44} />
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold leading-tight text-ink">{alert.parentName}</h2>
            <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] text-muted">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <SlotIcon aria-hidden className="size-4" strokeWidth={2.25} />
                <span lang={lang}>{t(`slot.${alert.slotName}`)}</span>
                <span className="tabular">{formatTime(alert.scheduledAt, lang)}</span>
              </span>
              <span aria-hidden>·</span>
              <span className="tabular whitespace-nowrap">{formatAgo(alert.scheduledAt, lang, now)}</span>
            </p>
          </div>
        </div>

        {!resolvedByParent && (
          <p lang={lang} className="mt-3 text-[17px] font-medium leading-snug text-ink">
            {t(alert.missClass === "OFFLINE" ? "alert.offline" : "alert.missed")}
          </p>
        )}

        {ladder.length > 0 && (
          <ol className="mt-4 flex items-center gap-1.5" aria-label="Family order">
            {ladder.map((person, index) => {
              const asked = index < alertedCount;
              const current = index === alertedCount - 1 && alert.status === "ESCALATING";
              return (
                <li key={person.mid} className="flex items-center gap-1.5">
                  {index > 0 && <ChevronRight aria-hidden className={cx("size-4", asked ? "text-ink" : "text-line-strong")} />}
                  <span
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-sm font-semibold",
                      current ? "bg-haldi-tint text-ink ring-2 ring-haldi" : asked ? "bg-paper text-ink" : "bg-paper text-muted",
                    )}
                  >
                    <Avatar name={person.displayName} size={22} />
                    {person.mid === viewerMid ? <span className="underline decoration-2 underline-offset-2">{person.displayName}</span> : person.displayName}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {alert.status === "ESCALATING" && (
          <motion.div key="open" exit={{ opacity: 0 }} className="border-t border-line bg-paper/60 p-4">
            {alert.alertedMe ? (
              <Button tone="claimed" size="lg" className="w-full" onClick={claim} disabled={claiming}>
                <Hand aria-hidden className="size-5" strokeWidth={2.5} />
                <span lang={lang}>{t("alert.claimButton")}</span>
              </Button>
            ) : (
              <p lang={lang} className="text-[15px] text-muted">
                {t("alert.notYourTurn")}
              </p>
            )}
            {lost && (
              <p lang={lang} role="status" className="mt-2 text-[15px] font-medium text-claimed">
                {t("alert.lostRace")}
              </p>
            )}
          </motion.div>
        )}

        {alert.status === "CLAIMED" && (
          <motion.div
            key="claimed"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 border-t border-claimed/20 bg-claimed-tint p-4"
            role="status"
          >
            <Avatar name={alert.claimedByName ?? "?"} size={36} ring="ring-2 ring-claimed" />
            <div className="min-w-0">
              {claimedByMe ? (
                <p lang={lang} className="text-[16px] font-semibold text-claimed">
                  {t("alert.claimedByYou")}
                </p>
              ) : (
                <>
                  <p className="text-[17px] font-semibold text-claimed">{alert.claimedByName}</p>
                  <p lang={lang} className="text-[15px] text-ink">
                    {t("alert.claimedByOther")}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {resolvedByParent && (
          <motion.p key="taken" initial={{ opacity: 0 }} animate={{ opacity: 1 }} lang={lang} className="border-t border-taken/20 bg-taken-tint p-4 text-[16px] font-semibold text-taken" role="status">
            {t("alert.parentTookIt")}
          </motion.p>
        )}
      </AnimatePresence>

      <button type="button" onClick={onWhy} className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[15px] font-semibold text-ink hover:bg-paper">
        <Info aria-hidden className="size-4.5" strokeWidth={2.25} />
        <span lang={lang} className="flex-1">
          {t("alert.why")}
        </span>
        <ChevronRight aria-hidden className="size-4.5 text-muted" />
      </button>
    </article>
  );
}
