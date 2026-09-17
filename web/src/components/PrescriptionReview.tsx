import type { SlotName } from "@dosecircle/shared";
import { CircleAlert, CircleCheck, Loader2, ShieldCheck, TriangleAlert, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "../i18n";
import type { MedicineInput, Prescription, PrescriptionRow } from "../lib/types";
import { EMPTY_MEDICINE, hasSchedule, MedicineFields } from "../routes/family/MedicinesPage";
import { Button, Card, cx } from "./ui";

export type Decision = { rowId: string; action: "confirm"; checked: true; medicine: MedicineInput } | { rowId: string; action: "remove" };

function addDays(days: number): string {
  const date = new Date(Date.now() + (days - 1) * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

/** Pre-fills only what was actually written. Unknown amounts stay empty for the person to decide. */
export function draftFromRow(row: PrescriptionRow): MedicineInput {
  const slots: Partial<Record<SlotName, number>> = {};
  for (const [slot, count] of Object.entries(row.schedule.slots)) if (typeof count === "number") slots[slot as SlotName] = count;
  return {
    ...EMPTY_MEDICINE,
    nameAsPrinted: row.medicine.drugAsWritten ?? "",
    strength: row.medicine.strength,
    slots,
    food: row.schedule.food,
    asNeeded: row.schedule.asNeeded,
    endDate: row.schedule.durationDays ? addDays(row.schedule.durationDays) : null,
  };
}

const LEVEL_LOOK = {
  red: { icon: CircleAlert, className: "bg-missed-tint text-missed", border: "border-missed/40" },
  amber: { icon: TriangleAlert, className: "bg-due-tint text-due", border: "border-due/40" },
  green: { icon: CircleCheck, className: "bg-taken-tint text-taken", border: "border-line" },
} as const;

/**
 * Human review of what the AI read. Every row must be checked or removed before saving, and the
 * server checks the same rule again. The photo stays beside the rows with the source line highlighted.
 */
export function PrescriptionReview({ prescription, lang: viewerLang, onSave, saving }: { prescription: Prescription; lang: string; onSave: (decisions: Decision[]) => void; saving: boolean }) {
  const { t, lang } = useT(viewerLang);
  const [drafts, setDrafts] = useState<Record<string, MedicineInput>>(() => Object.fromEntries(prescription.rows.map((row) => [row.rowId, draftFromRow(row)])));
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [focused, setFocused] = useState<string | null>(prescription.rows[0]?.rowId ?? null);
  const image = prescription.imageUrl ?? prescription.imagePath ?? null;

  const decided = prescription.rows.filter((row) => removed[row.rowId] || (checked[row.rowId] && drafts[row.rowId]!.nameAsPrinted.trim() && hasSchedule(drafts[row.rowId]!)));
  const confirmedCount = prescription.rows.filter((row) => !removed[row.rowId]).length;
  const ready = decided.length === prescription.rows.length && confirmedCount > 0;
  const focusedRefs = useMemo(() => new Set(prescription.rows.find((r) => r.rowId === focused)?.medicine.lineRefs ?? []), [focused, prescription.rows]);

  const save = () =>
    onSave(
      prescription.rows.map((row): Decision => (removed[row.rowId] ? { rowId: row.rowId, action: "remove" } : { rowId: row.rowId, action: "confirm", checked: true, medicine: drafts[row.rowId]! })),
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {image && (
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <img src={image} alt="" className="block w-full" />
            {prescription.lines.map(
              (line) =>
                line.box && (
                  <span
                    key={line.id}
                    aria-hidden
                    className={cx("absolute rounded-sm transition-all duration-200", focusedRefs.has(line.id) ? "bg-haldi/35 ring-2 ring-haldi" : "bg-transparent")}
                    style={{ left: `${line.box.left * 100}%`, top: `${line.box.top * 100}%`, width: `${line.box.width * 100}%`, height: `${line.box.height * 100}%` }}
                  />
                ),
            )}
          </div>
          {prescription.guardrailInterventions > 0 && (
            <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
              <ShieldCheck aria-hidden className="size-4 text-taken" />
              <span lang={lang}>{t("rx.guardrailRemoved")}</span>
            </p>
          )}
        </div>
      )}

      <div>
        <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur-sm lg:top-14">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 lang={lang} className="text-xl font-semibold leading-tight">
                {t("rx.review")}
              </h2>
              <p lang={lang} className="text-[14px] text-muted">
                {t("rx.reviewHelp")}
              </p>
            </div>
            <span className="tabular rounded-full bg-surface px-3 py-1.5 text-[15px] font-semibold ring-1 ring-line">
              <span lang={lang}>{t("rx.checked")}</span> {decided.length} / {prescription.rows.length}
            </span>
            <Button tone="ink" onClick={save} disabled={!ready || saving}>
              {saving && <Loader2 aria-hidden className="size-5 animate-spin" />}
              <span lang={lang}>{t("rx.save")}</span>
            </Button>
          </div>
        </div>

        <ol className="space-y-4">
          {prescription.rows.map((row) => {
            const look = LEVEL_LOOK[row.level];
            const Icon = look.icon;
            const isRemoved = removed[row.rowId];
            const written = [
              row.medicine.drugAsWritten,
              row.medicine.strength,
              row.medicine.dosePatternAsWritten,
              row.medicine.frequencyCodeAsWritten,
              row.medicine.foodCodeAsWritten,
              row.medicine.durationAsWritten,
            ].filter(Boolean);
            return (
              <li key={row.rowId} onFocusCapture={() => setFocused(row.rowId)} onPointerEnter={() => setFocused(row.rowId)}>
                <Card className={cx("border-2 p-4 transition-opacity", isRemoved ? "opacity-60" : look.border, checked[row.rowId] && !isRemoved && "border-taken/50")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold", look.className)}>
                      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
                      <span lang={lang}>{t(`rx.level.${row.level}`)}</span>
                    </span>
                    <span className="ml-auto">
                      <Button tone="quiet" size="sm" onClick={() => setRemoved({ ...removed, [row.rowId]: !isRemoved })}>
                        {isRemoved ? <Undo2 aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
                        <span lang={lang}>{isRemoved ? t("rx.restore") : t("rx.remove")}</span>
                      </Button>
                    </span>
                  </div>

                  <div className="mt-3 rounded-xl bg-paper p-3">
                    <p lang={lang} className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                      {t("rx.asWritten")}
                    </p>
                    <p lang="en" className="medicine-name mt-1 flex flex-wrap gap-1.5">
                      {written.map((part, index) => (
                        <code key={index} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[14px]">
                          {part}
                        </code>
                      ))}
                    </p>
                    {row.reasons.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {row.reasons.map((reason) => (
                          <li key={reason} lang={lang} className={cx("text-[14px]", row.level === "red" ? "text-missed" : "text-due")}>
                            {t(`rx.reason.${reason}`, { defaultValue: reason })}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.medicine.notesEnglish && (
                      <p className="mt-2 text-[14px] text-muted">
                        <span lang={lang} className="font-semibold">
                          {t("rx.readerNote")}:
                        </span>{" "}
                        <span lang="en">{row.medicine.notesEnglish}</span>
                      </p>
                    )}
                  </div>

                  {!isRemoved && (
                    <>
                      <div className="mt-4">
                        <MedicineFields value={drafts[row.rowId]!} onChange={(next) => setDrafts({ ...drafts, [row.rowId]: next })} lang={viewerLang} />
                      </div>
                      <label className={cx("mt-4 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3", checked[row.rowId] ? "border-taken bg-taken-tint" : "border-ink")}>
                        <input type="checkbox" className="size-6 accent-[var(--color-taken)]" checked={Boolean(checked[row.rowId])} onChange={(e) => setChecked({ ...checked, [row.rowId]: e.target.checked })} />
                        <span lang={lang} className="font-semibold">
                          {t("rx.checkedLabel")}
                        </span>
                      </label>
                      {checked[row.rowId] && !hasSchedule(drafts[row.rowId]!) && (
                        <p lang={lang} className="mt-2 text-[14px] font-medium text-missed">
                          {t("meds.needsWhen")}
                        </p>
                      )}
                    </>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
