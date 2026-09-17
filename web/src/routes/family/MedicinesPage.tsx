import { dailyUse, daysLeft as daysOfTabletsLeft, SLOT_NAMES, type SlotName } from "@dosecircle/shared";
import { Camera, HeartPulse, Loader2, Minus, PackagePlus, Pill, Plus, Utensils } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { Field, FamilyShell, inputClass } from "../../components/FamilyShell";
import { Button, Card, cx, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { formatCount, formatNumber } from "../../lib/format";
import type { MedicineInput, MedicineView } from "../../lib/types";
import { useApi } from "../../lib/useApi";

export function MedicinesPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <Medicines fid={me.fid} pid={pid} lang={me.lang} />}</RequireFamily>;
}

const COUNTS = [0.5, 1, 1.5, 2];

export const EMPTY_MEDICINE: MedicineInput = { nameAsPrinted: "", strength: null, slots: {}, food: null, critical: false, asNeeded: false, pillsLeft: null, refillThresholdDays: 5, endDate: null };

/** The same fields for manual entry and for correcting a prescription row. */
export function MedicineFields({ value, onChange, lang: viewerLang }: { value: MedicineInput; onChange: (next: MedicineInput) => void; lang: string }) {
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
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {SLOT_NAMES.map((slot) => {
            const Icon = SLOT_ICONS[slot];
            const count = value.slots[slot];
            const on = count !== undefined;
            return (
              <div key={slot} className={cx("rounded-xl border-2 p-2", on ? "border-ink bg-haldi-tint/60" : "border-line bg-surface")}>
                <button type="button" onClick={() => setSlot(slot, on ? undefined : 1)} aria-pressed={on} className="flex min-h-10 w-full items-center gap-2 text-left font-semibold">
                  <Icon aria-hidden className="size-5" strokeWidth={2.25} />
                  <span lang={lang}>{t(`slot.${slot}`)}</span>
                </button>
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

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3">
        <input type="checkbox" className="size-5 accent-[var(--color-critical)]" checked={value.critical} onChange={(e) => onChange({ ...value, critical: e.target.checked })} />
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

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("meds.pills")} lang={lang}>
          <input className={cx(inputClass, "tabular")} type="number" inputMode="numeric" min={0} max={10000} value={value.pillsLeft ?? ""} onChange={(e) => onChange({ ...value, pillsLeft: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
        </Field>
        <Field label={t("meds.endDate")} lang={lang}>
          <input className={inputClass} type="date" value={value.endDate ?? ""} onChange={(e) => onChange({ ...value, endDate: e.target.value || null })} />
        </Field>
      </div>
    </div>
  );
}

export function hasSchedule(value: MedicineInput): boolean {
  return value.asNeeded || Object.values(value.slots).some((count) => (count ?? 0) > 0);
}

function Medicines({ fid, pid, lang: myLang }: { fid: string; pid: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const base = `/families/${fid}/parents/${pid}/medicines`;
  const list = useApi(() => api<{ medicines: MedicineView[] }>(base, { auth: "family" }), [base]);
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
        <>
          <Link to={`/parents/${pid}/prescription`} className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-button)] bg-ink px-4 font-semibold text-paper">
            <Camera aria-hidden className="size-5" strokeWidth={2.25} />
            <span lang={lang}>{t("meds.scan")}</span>
          </Link>
          <Button tone="quiet" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-5" />
            <span lang={lang}>{t("meds.add")}</span>
          </Button>
        </>
      }
    >
      {adding && (
        <Card className="mb-6 p-4">
          <form onSubmit={save} className="space-y-4">
            <MedicineFields value={draft} onChange={setDraft} lang={myLang} />
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
        <div className="flex flex-wrap items-start gap-3">
          <Pill aria-hidden className="mt-1 size-6 text-muted" strokeWidth={2.25} />
          <div className="min-w-0 flex-1">
            <p lang="en" className="medicine-name text-xl font-semibold">
              {medicine.nameAsPrinted} {medicine.strength && <span className="font-normal text-muted">{medicine.strength}</span>}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {medicine.asNeeded ? (
                <span lang={lang} className="rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                  {t("meds.asNeeded")}
                </span>
              ) : (
                SLOT_NAMES.filter((s) => medicine.slots[s] !== undefined && medicine.slots[s] !== null).map((slot) => (
                  <span key={slot} className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                    <span lang={lang}>{t(`slot.${slot}`)}</span>
                    <span className="tabular text-muted">{formatCount(medicine.slots[slot] ?? null)}</span>
                  </span>
                ))
              )}
              {medicine.food && (
                <span lang={lang} className="rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                  {t(`parent.food.${medicine.food}`)}
                </span>
              )}
              {medicine.critical && (
                <span lang={lang} className="rounded-full bg-critical-tint px-2.5 py-1 text-[14px] font-semibold text-critical">
                  {t("status.critical")}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button tone="quiet" size="sm" onClick={() => setRefilling((v) => !v)}>
              <PackagePlus aria-hidden className="size-4" />
              <span lang={lang}>{t("meds.refill")}</span>
            </Button>
            <Button
              tone="quiet"
              size="sm"
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
