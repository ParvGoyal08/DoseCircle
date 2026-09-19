import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { FamilyShell } from "../../components/FamilyShell";
import { InsightsGrid, InsightsHero } from "../../components/InsightsDashboard";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import type { Dashboard, Insights } from "../../lib/types";
import { useApi } from "../../lib/useApi";

/**
 * /parents/:pid/insights — everything that answers "how is this going", away from the home screen.
 *
 * The home screen is what a family opens when something might be wrong; it has to answer that in
 * one glance. Charts belong to the other kind of visit — sitting down to look at a month, or
 * getting ready for a doctor's appointment — so the doctor's report is the first thing on this page
 * rather than a sixth tile on the home screen.
 */
export function InsightsPage() {
  return <RequireFamily>{(me) => <InsightsView fid={me.fid} lang={me.lang} />}</RequireFamily>;
}

function InsightsView({ fid, lang: myLang }: { fid: string; lang: string }) {
  const { pid = "" } = useParams();
  const { t, lang } = useT(myLang);
  const [days, setDays] = useState<7 | 30>(30);
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid]);
  const insights = useApi(() => api<Insights>(`/families/${fid}/parents/${pid}/insights`, { auth: "family", query: { days: String(days) } }), [fid, pid, days], 60_000);
  const parent = dashboard.data?.parents.find((p) => p.pid === pid);

  return (
    <FamilyShell
      lang={myLang}
      full
      back="/home"
      title={parent ? parent.displayName : t("action.insights")}
      actions={
        <Link
          to={`/parents/${pid}/report`}
          className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-button)] bg-indigo px-5 text-[16px] font-semibold text-white shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_6px_16px_-8px_rgb(37_35_110/0.6)] hover:bg-indigo-deep"
        >
          <FileText aria-hidden className="size-5" />
          <span lang={lang}>{t("action.report")}</span>
        </Link>
      }
    >
      {!insights.data || !parent ? (
        <div className="grid place-items-center py-24">
          <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          <InsightsHero parentName={parent.displayName} lastReceiptAt={parent.lastReceiptAt} insights={insights.data} days={days} onDays={setDays} lang={myLang} />
          <InsightsGrid insights={insights.data} lang={myLang} />
        </div>
      )}
    </FamilyShell>
  );
}
