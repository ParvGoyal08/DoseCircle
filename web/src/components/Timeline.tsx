import { BellRing, CircleCheck, Hand, Megaphone, ShieldCheck, Smartphone, TriangleAlert, Users, WifiOff, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useT } from "../i18n";
import { formatGap, formatTime } from "../lib/format";
import type { TimelineItem, TimelineKind } from "../lib/types";
import { cx } from "./ui";

const KIND_LOOK: Record<TimelineKind, { icon: LucideIcon; dot: string }> = {
  reminder_sent: { icon: BellRing, dot: "bg-due text-white" },
  nudge_sent: { icon: BellRing, dot: "bg-due text-white" },
  reached_phone: { icon: Smartphone, dot: "bg-ink text-paper" },
  no_confirmation: { icon: TriangleAlert, dot: "bg-missed text-white" },
  reminder_reached_phone: { icon: TriangleAlert, dot: "bg-missed text-white" },
  phone_seemed_offline: { icon: WifiOff, dot: "bg-offline text-white" },
  member_alerted: { icon: Megaphone, dot: "bg-missed text-white" },
  family_alerted: { icon: Users, dot: "bg-missed text-white" },
  claimed: { icon: Hand, dot: "bg-claimed text-white" },
  taken: { icon: CircleCheck, dot: "bg-taken text-white" },
  others_stood_down: { icon: Users, dot: "bg-claimed text-white" },
  family_told_taken: { icon: Users, dot: "bg-taken text-white" },
  nobody_responded: { icon: TriangleAlert, dot: "bg-missed text-white" },
};

/**
 * "Why am I seeing this?" Every step shows when it happened, how long after the previous one, the
 * Step Functions state that did it, and — for claims and confirmations — the Cedar policy that allowed it.
 */
export function Timeline({ items, lang: viewerLang, live = false }: { items: TimelineItem[]; lang: string; live?: boolean }) {
  const { t, lang } = useT(viewerLang);
  const reduceMotion = useReducedMotion();

  return (
    <ol className="relative">
      {items.map((item, index) => {
        const look = KIND_LOOK[item.kind];
        const Icon = look.icon;
        const last = index === items.length - 1;
        return (
          <motion.li
            key={`${item.at}-${item.kind}-${index}`}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="relative flex gap-3 pb-5"
          >
            {!last && <span aria-hidden className="absolute left-[16px] top-9 bottom-0 w-0 border-l-2 border-dashed border-ink/30" />}
            <span className={cx("relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink shadow-[2px_2px_0_var(--color-ink)]", look.dot, live && last && "ring-4 ring-haldi")}>
              <Icon aria-hidden className="size-4" strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted">
                <span className="tabular font-semibold text-ink">{formatTime(item.at, lang)}</span>
                {item.sincePreviousSeconds !== null && <span className="tabular">{formatGap(item.sincePreviousSeconds, lang)}</span>}
              </p>
              {item.people && item.people.length > 0 && <p className="text-[15px] font-semibold text-ink">{item.people.join(", ")}</p>}
              <p lang={lang} className="text-[15px] leading-snug text-ink">
                {t(`timeline.${item.kind}`)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.stateName && (
                  <code className="rounded-md border-[1.5px] border-indigo/40 bg-indigo-tint px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-indigo" title={t("timeline.stateTag")}>
                    {item.stateName}
                  </code>
                )}
                {item.authorizedBy?.map((policy) => (
                  <code key={policy} className="inline-flex items-center gap-1 rounded-md border-[1.5px] border-taken/40 bg-taken-tint px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-taken" title={t("timeline.allowedBy")}>
                    <ShieldCheck aria-hidden className="size-3" strokeWidth={2.5} />
                    {policy}
                  </code>
                ))}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
