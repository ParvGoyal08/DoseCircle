import { dailyUse, daysLeft as daysOfTabletsLeft, FAST_LADDER, SLOT_NAMES, STANDARD_LADDER, type SlotName } from "@dosecircle/shared";
import { BellRing, Camera, HeartPulse, Loader2, Minus, PackagePlus, Pill, Plus, Utensils } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { Field, FamilyShell, inputClass } from "../../components/FamilyShell";
import { Button, Card, cx, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { formatCount, formatNumber } from "../../lib/format";
import type { Dashboard, MedicineInput, MedicineView } from "../../lib/types";
import { useApi } from "../../lib/useApi";

export function MedicinesPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <Medicines fid={me.fid} pid={pid} lang={me.lang} />}</RequireFamily>;
}

const COUNTS = [0.5, 1, 1.5, 2];

export const EMPTY_MEDICINE: MedicineInput = { nameAsPrinted: "", strength: null, slots: {}, food: null, critical: false, asNeeded: false, pillsLeft: null, refillThresholdDays: 5, endDate: null };

/** The same fields for manual entry and for correcting a prescription row. */
export function MedicineFields({
  value,
  onChange,
  lang: viewerLang,
  slotTimes,
  editTimes,
}: {
  value: MedicineInput;
  onChange: (next: MedicineInput) => void;
  lang: string;
  /** The parent's own clock times. Without them the chips can only name the part of the day. */
  slotTimes?: Record<SlotName, string>;
  /** Supplied where the times can be changed in place; omitted, they are shown but not editable. */
  editTimes?: { onChange: (slot: SlotName, time: string) => void; onCommit: (slot: SlotName) => void; saved: boolean };
}) {
  const { t, lang } = useT(viewerLang);
  const setSlot = (slot: SlotName, count: number | undefined) => {
    const slots = { ...value.slots };
    if (count === undefined) delete slots[slot];
    else slots[slot] = count;
    onChange({ ...value, slots });
  };

  return (
    <div className="space-y-4">
      <Field label={t("meds.name")} lang={lang}>
        <input lang="en" className={cx(inputClass, "medicine-name text-lg font-semibold")} required maxLength={80} value={value.nameAsPrinted} onChange={(e) => onChange({ ...value, nameAsPrinted: e.target.value })} />
      </Field>
      <Field label={t("meds.strength")} lang={lang}>
        <input lang="en" className={inputClass} maxLength={40} value={value.strength ?? ""} onChange={(e) => onChange({ ...value, strength: e.target.value || null })} />
      </Field>

      <fieldset disabled={value.asNeeded} className={cx(value.asNeeded && "opacity-50")}>
        <legend lang={lang} className="text-[15px] font-semibold">
          {t("meds.when")}
        </legend>
        {/* "Morning" on its own never said when the phone would actually ring, and the clock times
            used to live two screens away under the parent's settings. They are on the chip now and
            editable there, so the person deciding the schedule sets the time while deciding it.
            The warning is not decoration: one time is shared by every medicine in that slot, so a
            family moving breakfast an hour later must know it moves all of them. */}
        <p lang={lang} className="mt-0.5 text-[14px] text-muted">
          {t(editTimes ? "meds.whenHelpEditable" : "meds.whenHelp")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SLOT_NAMES.map((slot) => {
            const Icon = SLOT_ICONS[slot];
            const count = value.slots[slot];
            const on = count !== undefined;
            const time = slotTimes?.[slot];
            return (
              <div key={slot} role="group" aria-label={t(`slot.${slot}`)} className={cx("rounded-xl border-2 p-2", on ? "border-ink bg-haldi-tint/60" : "border-line bg-surface")}>
                <button type="button" onClick={() => setSlot(slot, on ? undefined : 1)} aria-pressed={on} className="flex min-h-10 w-full items-center gap-2 text-left font-semibold">
                  <Icon aria-hidden className="size-5 shrink-0" strokeWidth={2.25} />
                  <span lang={lang}>{t(`slot.${slot}`)}</span>
                  {time !== undefined && !editTimes && <span className="tabular ml-auto text-[14px] font-semibold text-muted">{time}</span>}
                </button>
                {/* Its own row, full width. Beside the label it had to share half a card with
                    "Afternoon" (longer still in Kannada), and a 12-hour browser renders "07:30 AM"
                    plus a clock icon — squeezed, the AM/PM was cut off, which on a reminder time is
                    the one part that must never be ambiguous. */}
                {time !== undefined && editTimes && (
                  <input
                    type="time"
                    aria-label={t("meds.reminderTime")}
                    value={time}
                    onChange={(e) => editTimes.onChange(slot, e.target.value)}
                    onBlur={() => editTimes.onCommit(slot)}
                    className="tabular mt-1 block min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[15px] font-semibold text-ink focus:bg-haldi-tint/40 focus:outline-none"
                  />
                )}
                {on && (
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <button type="button" aria-label="−" className="grid size-10 place-items-center rounded-lg bg-surface" onClick={() => setSlot(slot, COUNTS[Math.max(0, COUNTS.indexOf(count) - 1)])}>
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="tabular text-xl font-semibold">{formatCount(count)}</span>
                    <button type="button" aria-label="+" className="grid size-10 place-items-center rounded-lg bg-surface" onClick={() => setSlot(slot, COUNTS[Math.min(COUNTS.length - 1, COUNTS.indexOf(count) + 1)])}>
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {editTimes?.saved && (
          <p lang={lang} role="status" className="mt-2 text-[14px] font-medium text-taken">
            {t("meds.timesSaved")}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend lang={lang} className="flex items-center gap-2 text-[15px] font-semibold">
          <Utensils aria-hidden className="size-4" /> {t("meds.food")}
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {([null, "before", "after"] as const).map((food) => (
            <button key={String(food)} type="button" aria-pressed={value.food === food} onClick={() => onChange({ ...value, food })} className={cx("min-h-11 rounded-full border-2 px-4 font-semibold", value.food === food ? "border-ink bg-ink text-paper" : "border-line bg-surface")}>
              <span lang={lang}>{food === null ? t("meds.anyTime") : t(`parent.food.${food}`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className={cx("flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3", value.asNeeded && "opacity-50")}>
        <input type="checkbox" className="size-5 accent-[var(--color-critical)]" disabled={value.asNeeded} checked={value.critical && !value.asNeeded} onChange={(e) => onChange({ ...value, critical: e.target.checked })} />
        <HeartPulse aria-hidden className="size-5 text-critical" />
        <span lang={lang} className="font-medium">
          {t("meds.critical")}
        </span>
      </label>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3">
        <input type="checkbox" className="size-5" checked={value.asNeeded} onChange={(e) => onChange({ ...value, asNeeded: e.target.checked, slots: e.target.checked ? {} : value.slots })} />
        <span lang={lang} className="font-medium">
          {t("meds.asNeeded")}
        </span>
      </label>

      <EscalationExplainer critical={value.critical} asNeeded={value.asNeeded} lang={viewerLang} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("meds.pills")} hint={t("meds.pillsHint")} lang={lang}>
          <input className={cx(inputClass, "tabular")} type="number" inputMode="numeric" min={0} max={10000} value={value.pillsLeft ?? ""} onChange={(e) => onChange({ ...value, pillsLeft: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
        </Field>
        <Field label={t("meds.endDate")} hint={t("meds.endDateHint")} lang={lang}>
          <input className={inputClass} type="date" value={value.endDate ?? ""} onChange={(e) => onChange({ ...value, endDate: e.target.value || null })} />
        </Field>
      </div>
    </div>
  );
}

/**
 * What actually happens after a reminder, in minutes, for this medicine.
 *
 * Without it the form asks for a time of day and an "important medicine" tick and never says what
 * either one does; a family setting up their mother's insulin could not tell whether anyone would
 * be told, or when. The timings come from the same table the state machine runs on, so this cannot
 * drift away from the behaviour it describes. Each duration sits in its own element — Kannada and
 * Hindi inflect nouns after a number, so a translated sentence is never cut open to hold one.
 */
function EscalationExplainer({ critical, asNeeded, lang: viewerLang }: { critical: boolean; asNeeded: boolean; lang: string }) {
  const { t, lang } = useT(viewerLang);
  if (asNeeded) {
    return (
      <p lang={lang} className="rounded-xl bg-sunken px-4 py-3 text-[14.5px] text-muted">
        {t("meds.asNeededHelp")}
      </p>
    );
  }

  const timings = critical ? FAST_LADDER : STANDARD_LADDER;
  const minutes = (seconds: number) => formatNumber(Math.round(seconds / 60), lang, { style: "unit", unit: "minute", unitDisplay: "long" });
  const steps = [
    timings.nudgeWaitSeconds > 0 ? { after: minutes(timings.parentWaitSeconds), text: t("meds.step.nudge") } : null,
    { after: minutes(timings.parentWaitSeconds + timings.nudgeWaitSeconds), text: t("meds.step.first") },
    { after: minutes(timings.claimWaitSeconds), text: t("meds.step.next") },
    { after: minutes(timings.finalWaitSeconds), text: t("meds.step.everyone") },
  ].filter((step) => step !== null);

  return (
    <section className={cx("rounded-xl border px-4 py-3", critical ? "border-critical/30 bg-critical/5" : "border-line bg-sunken")}>
      <h3 lang={lang} className="flex items-center gap-2 text-[14.5px] font-semibold">
        <BellRing aria-hidden className="size-4.5 shrink-0" strokeWidth={2.25} />
        {t("meds.escalationTitle")}
      </h3>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step) => (
          <li key={step.text} className="flex gap-3 text-[14.5px]">
            {/* Wide enough for "20 minutes" on one line, and nowrap so a longer translated unit
                pushes the sentence across instead of folding the number away from it. */}
            <span className="tabular min-w-[92px] shrink-0 whitespace-nowrap font-semibold text-ink">{step.after}</span>
            <span lang={lang} className="text-muted">
              {step.text}
            </span>
          </li>
        ))}
      </ol>
      {critical && (
        <p lang={lang} className="mt-2.5 text-[13.5px] font-medium text-critical">
          {t("meds.escalationFast")}
        </p>
      )}
    </section>
  );
}

export function hasSchedule(value: MedicineInput): boolean {
  return value.asNeeded || Object.values(value.slots).some((count) => (count ?? 0) > 0);
}

function Medicines({ fid, pid, lang: myLang }: { fid: string; pid: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const base = `/families/${fid}/parents/${pid}/medicines`;
  const list = useApi(() => api<{ medicines: MedicineView[] }>(base, { auth: "family" }), [base]);
  // Only for the clock times on the "when" chips: the form cannot say when a reminder fires
  // without them, and they belong to the parent rather than to any one medicine.
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid]);
  const saved = dashboard.data?.parents.find((p) => p.pid === pid)?.slotTimes;
  // Typing into a time box has to show what was typed straight away, but it must not send a PATCH
  // per keystroke: every save re-syncs this parent's EventBridge schedules. Edits are held here and
  // committed on blur, and only when the value actually moved.
  const [draftTimes, setDraftTimes] = useState<Partial<Record<SlotName, string>>>({});
  const [timesSaved, setTimesSaved] = useState(false);
  const slotTimes = saved ? { ...saved, ...draftTimes } : undefined;

  const commitTime = async (slot: SlotName) => {
    const next = draftTimes[slot];
    if (!next || !saved || next === saved[slot]) return;
    try {
      await api(`/families/${fid}/parents/${pid}`, { method: "PATCH", auth: "family", body: { slotTimes: { [slot]: next } } });
      setTimesSaved(true);
      setTimeout(() => setTimesSaved(false), 4000);
      await dashboard.reload();
    } finally {
      setDraftTimes((prev) => {
        const rest = { ...prev };
        delete rest[slot];
        return rest;
      });
    }
  };
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<MedicineInput>(EMPTY_MEDICINE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasSchedule(draft)) return setError(t("meds.needsWhen"));
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: "POST", auth: "family", body: draft });
      setAdding(false);
      setDraft(EMPTY_MEDICINE);
      await list.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FamilyShell
      lang={myLang}
      back="/home"
      title={t("meds.title")}
      actions={
        // Full width and stacked on a phone. Left to wrap, "Photograph a prescription" took a row on
        // its own and "Add by hand" dropped under it at half the width, which read as a mistake;
        // side by side, the longer label folded inside its half.
        <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <Link to={`/parents/${pid}/prescription`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-button)] bg-ink px-3 text-center font-semibold leading-tight text-paper sm:px-4">
            <Camera aria-hidden className="size-5 shrink-0" strokeWidth={2.25} />
            <span lang={lang}>{t("meds.scan")}</span>
          </Link>
          <Button tone="quiet" className="leading-tight" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-5 shrink-0" />
            <span lang={lang}>{t("meds.add")}</span>
          </Button>
        </div>
      }
    >
      {adding && (
        <Card className="mb-6 p-4">
          <form onSubmit={save} className="space-y-4">
            <MedicineFields
              value={draft}
              onChange={setDraft}
              lang={myLang}
              slotTimes={slotTimes}
              editTimes={{ onChange: (slot, time) => setDraftTimes((prev) => ({ ...prev, [slot]: time })), onCommit: commitTime, saved: timesSaved }}
            />
            {error && (
              <p role="alert" className="rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button tone="ink" type="submit" disabled={busy}>
                {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
                <span lang={lang}>{t("meds.save")}</span>
              </Button>
              <Button tone="quiet" onClick={() => setAdding(false)}>
                <span lang={lang}>{t("meds.cancel")}</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {list.data?.medicines.length === 0 && !adding && (
        <p lang={lang} className="text-lg text-muted">
          {t("home.noMedicines")}
        </p>
      )}
      <ul className="space-y-3">
        {list.data?.medicines.map((medicine) => (
          <MedicineRow key={medicine.medId} medicine={medicine} lang={myLang} endpoint={`${base}/${medicine.medId}`} onChanged={list.reload} />
        ))}
      </ul>
    </FamilyShell>
  );
}

function MedicineRow({ medicine, lang: viewerLang, endpoint, onChanged }: { medicine: MedicineView; lang: string; endpoint: string; onChanged: () => Promise<void> }) {
  const { t, lang } = useT(viewerLang);
  const [refilling, setRefilling] = useState(false);
  const [added, setAdded] = useState(10);
  // Same rule as the server's refill warning (@dosecircle/shared).
  const daysLeft = medicine.pillsLeft === null ? null : daysOfTabletsLeft(medicine.pillsLeft, dailyUse(medicine));
  const level = medicine.needsRecount ? "recount" : daysLeft === null ? null : daysLeft <= 2 ? "critical" : daysLeft <= medicine.refillThresholdDays ? "low" : "ok";
  const gauge = daysLeft === null ? 0 : Math.min(1, daysLeft / 30);

  return (
    <li>
      <Card className="p-4">
        {/* On a phone the two buttons used to share the top row with the name, which left the name
            about a hundred pixels: "Glycomet" broke mid-word and every chip folded onto two lines.
            The buttons now sit under the details on a phone and move up beside them only when
            there is room. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <Pill aria-hidden className="mt-1 size-6 shrink-0 text-muted" strokeWidth={2.25} />
          <div className="min-w-0 flex-1">
            <p lang="en" className="medicine-name text-xl font-semibold">
              {medicine.nameAsPrinted} {medicine.strength && <span className="font-normal text-muted">{medicine.strength}</span>}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {medicine.asNeeded ? (
                <span lang={lang} className="whitespace-nowrap rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                  {t("meds.asNeeded")}
                </span>
              ) : (
                SLOT_NAMES.filter((s) => medicine.slots[s] !== undefined && medicine.slots[s] !== null).map((slot) => (
                  <span key={slot} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                    <span lang={lang}>{t(`slot.${slot}`)}</span>
                    <span className="tabular text-muted">{formatCount(medicine.slots[slot] ?? null)}</span>
                  </span>
                ))
              )}
              {medicine.food && (
                <span lang={lang} className="whitespace-nowrap rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                  {t(`parent.food.${medicine.food}`)}
                </span>
              )}
              {medicine.critical && (
                <span lang={lang} className="whitespace-nowrap rounded-full bg-critical-tint px-2.5 py-1 text-[14px] font-semibold text-critical">
                  {t("status.critical")}
                </span>
              )}
            </p>
          </div>
          </div>
          <div className="flex gap-2 border-t border-line pt-3 sm:border-0 sm:pt-0">
            <Button tone="quiet" size="sm" className="flex-1 sm:flex-none" onClick={() => setRefilling((v) => !v)}>
              <PackagePlus aria-hidden className="size-4" />
              <span lang={lang}>{t("meds.refill")}</span>
            </Button>
            <Button
              tone="quiet"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={async () => {
                if (!window.confirm(t("meds.stopConfirm"))) return;
                await api(endpoint, { method: "DELETE", auth: "family" });
                await onChanged();
              }}
            >
              <span lang={lang}>{t("meds.stop")}</span>
            </Button>
          </div>
        </div>

        {level && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[14px]">
              <span lang={lang} className="text-muted">
                {medicine.needsRecount ? t("refill.recount") : t("meds.daysLeft")}
              </span>
              {daysLeft !== null && <span className={cx("tabular font-semibold", level === "critical" ? "text-missed" : level === "low" ? "text-due" : "text-ink")}>{formatNumber(daysLeft, lang, { style: "unit", unit: "day", unitDisplay: "long" })}</span>}
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-paper" aria-hidden>
              <div className={cx("h-full rounded-full", level === "critical" ? "bg-missed" : level === "low" ? "bg-due" : level === "recount" ? "bg-offline" : "bg-taken")} style={{ width: `${Math.max(4, gauge * 100)}%` }} />
            </div>
          </div>
        )}

        {refilling && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await api(`${endpoint}/refill`, { method: "POST", auth: "family", body: { added } });
              setRefilling(false);
              await onChanged();
            }}
          >
            <Field label={t("meds.refillAmount")} lang={lang}>
              <input className={cx(inputClass, "tabular w-32")} type="number" min={1} max={10000} value={added} onChange={(e) => setAdded(Math.max(1, Math.round(Number(e.target.value))))} />
            </Field>
            <Button tone="ink" type="submit">
              <span lang={lang}>{t("meds.save")}</span>
            </Button>
          </form>
        )}
      </Card>
    </li>
  );
}
