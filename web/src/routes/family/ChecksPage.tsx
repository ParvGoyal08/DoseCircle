import { checkDefinition, CHECK_TYPES, SLOT_NAMES, type CheckType, type SlotName } from "@dosecircle/shared";
import { Activity, BellOff, BellRing, Droplet, Loader2, Plus, Scale, Thermometer, Wind, type LucideIcon } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { ReadingEntry, readyReadings, type ReadingDraft } from "../../components/ReadingEntry";
import { FamilyShell, Field, inputClass } from "../../components/FamilyShell";
import { Button, Card, cx, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import type { CheckCatalogue, CheckInput, CheckView } from "../../lib/types";
import { useApi } from "../../lib/useApi";

/** An icon per measurement, so the list is scannable without reading every label. */
export const CHECK_ICONS: Record<CheckType, LucideIcon> = {
  glucose: Droplet,
  bp: Activity,
  weight: Scale,
  spo2: Wind,
  temperature: Thermometer,
};

export function ChecksPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <Checks fid={me.fid} pid={pid} lang={me.lang} />}</RequireFamily>;
}

const emptyCheck = (type: CheckType): CheckInput => ({
  type,
  slots: ["morning"],
  weekdays: [],
  escalates: checkDefinition(type).escalatesByDefault,
  endDate: null,
});

function Checks({ fid, pid, lang: myLang }: { fid: string; pid: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const base = `/families/${fid}/parents/${pid}/checks`;
  const list = useApi(() => api<CheckCatalogue>(base, { auth: "family" }), [base]);
  const [draft, setDraft] = useState<CheckInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduled = list.data?.checks ?? [];
  const available = useMemo(() => CHECK_TYPES.filter((type) => !scheduled.some((c) => c.type === type)), [scheduled]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (draft.slots.length === 0) return setError(t("checks.needsWhen"));
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: "POST", auth: "family", body: draft });
      setDraft(null);
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
      title={t("checks.title")}
      actions={
        available.length > 0 && (
          <Button tone="ink" onClick={() => setDraft(emptyCheck(available[0]!))}>
            <Plus aria-hidden className="size-5" />
            <span lang={lang}>{t("checks.add")}</span>
          </Button>
        )
      }
    >
      <p lang={lang} className="mb-1 text-lg text-ink">
        {t("checks.intro")}
      </p>
      <p lang={lang} className="mb-6 text-[14.5px] text-muted">
        {t("checks.notAdvice")}
      </p>

      {draft && (
        <Card className="mb-6 p-4">
          <form onSubmit={save} className="space-y-4">
            <fieldset>
              <legend lang={lang} className="text-[15px] font-semibold">
                {t("checks.what")}
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {available.map((type) => {
                  const Icon = CHECK_ICONS[type];
                  const on = draft.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...emptyCheck(type), slots: draft.slots, weekdays: draft.weekdays })}
                      className={cx("inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 font-semibold", on ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
                    >
                      <Icon aria-hidden className="size-5" strokeWidth={2.25} />
                      <span lang={lang}>{t(`check.${type}`)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <SlotPicker slots={draft.slots} onChange={(slots) => setDraft({ ...draft, slots })} lang={myLang} />
            <WeekdayPicker weekdays={draft.weekdays} onChange={(weekdays) => setDraft({ ...draft, weekdays })} lang={myLang} />

            <label className="flex min-h-12 items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <input type="checkbox" className="mt-1 size-5" checked={draft.escalates ?? false} onChange={(e) => setDraft({ ...draft, escalates: e.target.checked })} />
              <span>
                <span lang={lang} className="font-medium">
                  {t("checks.escalates")}
                </span>
                <span lang={lang} className="mt-0.5 block text-[13.5px] text-muted">
                  {t("checks.escalatesHelp")}
                </span>
              </span>
            </label>

            <Field label={t("meds.endDate")} lang={lang}>
              <input className={inputClass} type="date" value={draft.endDate ?? ""} onChange={(e) => setDraft({ ...draft, endDate: e.target.value || null })} />
            </Field>

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
              <Button tone="quiet" onClick={() => setDraft(null)}>
                <span lang={lang}>{t("meds.cancel")}</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {scheduled.length === 0 && !draft && (
        <p lang={lang} className="text-lg text-muted">
          {t("checks.none")}
        </p>
      )}
      <ul className="space-y-3">
        {scheduled.map((check) => (
          <CheckRow key={check.checkId} check={check} lang={myLang} endpoint={`${base}/${check.checkId}`} readingsEndpoint={`/families/${fid}/parents/${pid}/readings`} onChanged={list.reload} />
        ))}
      </ul>
    </FamilyShell>
  );
}

function SlotPicker({ slots, onChange, lang: viewerLang }: { slots: SlotName[]; onChange: (slots: SlotName[]) => void; lang: string }) {
  const { t, lang } = useT(viewerLang);
  return (
    <fieldset>
      <legend lang={lang} className="text-[15px] font-semibold">
        {t("checks.when")}
      </legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {SLOT_NAMES.map((slot) => {
          const Icon = SLOT_ICONS[slot];
          const on = slots.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? slots.filter((s) => s !== slot) : [...slots, slot])}
              className={cx("flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 font-semibold", on ? "border-ink bg-haldi-tint/60" : "border-line bg-surface")}
            >
              <Icon aria-hidden className="size-5" strokeWidth={2.25} />
              <span lang={lang}>{t(`slot.${slot}`)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function WeekdayPicker({ weekdays, onChange, lang: viewerLang }: { weekdays: number[]; onChange: (weekdays: number[]) => void; lang: string }) {
  const { t, lang } = useT(viewerLang);
  const everyDay = weekdays.length === 0;
  return (
    <fieldset>
      <legend lang={lang} className="text-[15px] font-semibold">
        {t("checks.days")}
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={everyDay}
          onClick={() => onChange([])}
          className={cx("min-h-12 rounded-full border-2 px-4 font-semibold", everyDay ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
        >
          <span lang={lang}>{t("checks.everyDay")}</span>
        </button>
        {DAY_KEYS.map((key, day) => {
          const on = weekdays.includes(day);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort((a, b) => a - b))}
              className={cx("min-h-12 min-w-14 rounded-full border-2 px-3 font-semibold", on ? "border-ink bg-haldi-tint/60" : "border-line bg-surface")}
            >
              <span lang={lang}>{t(`day.${key}`)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CheckRow({
  check,
  lang: viewerLang,
  endpoint,
  readingsEndpoint,
  onChanged,
}: {
  check: CheckView;
  lang: string;
  endpoint: string;
  readingsEndpoint: string;
  onChanged: () => Promise<void>;
}) {
  const { t, lang } = useT(viewerLang);
  const Icon = CHECK_ICONS[check.type];
  const [editing, setEditing] = useState(false);
  const [entering, setEntering] = useState(false);
  const [draft, setDraft] = useState<ReadingDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const line = { checkId: check.checkId, type: check.type, fields: check.fields };

  const patch = async (body: Partial<Pick<CheckView, "slots" | "weekdays" | "escalates" | "endDate">>) => {
    await api(endpoint, { method: "PATCH", auth: "family", body });
    await onChanged();
  };

  const submitReading = async () => {
    const [ready] = readyReadings([line], draft);
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api(readingsEndpoint, { method: "POST", auth: "family", body: ready });
      setDraft({});
      setEntering(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Icon aria-hidden className="mt-1 size-6 text-muted" strokeWidth={2.25} />
          <div className="min-w-0 flex-1">
            <p lang={lang} className="text-xl font-semibold">
              {t(`check.${check.type}`)}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {check.slots.map((slot) => (
                <span key={slot} lang={lang} className="rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                  {t(`slot.${slot}`)}
                </span>
              ))}
              <span lang={lang} className="rounded-full bg-paper px-2.5 py-1 text-[14px] font-semibold">
                {check.weekdays.length === 0 ? t("checks.everyDay") : check.weekdays.map((d) => t(`day.${DAY_KEYS[d]}`)).join(", ")}
              </span>
              <span
                lang={lang}
                className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px] font-semibold", check.escalates ? "bg-due-tint text-due" : "bg-offline-tint text-offline")}
              >
                {check.escalates ? <BellRing aria-hidden className="size-3.5" /> : <BellOff aria-hidden className="size-3.5" />}
                {check.escalates ? t("checks.escalates") : t("checks.quiet")}
              </span>
              <span lang="en" className="tabular rounded-full bg-paper px-2.5 py-1 text-[14px] text-muted">
                {check.fields.map((f) => `${f.min}–${f.max} ${f.unit}`).join(" · ")}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button tone="quiet" size="sm" onClick={() => setEntering((v) => !v)}>
              <span lang={lang}>{t("checks.enter")}</span>
            </Button>
            <Button tone="quiet" size="sm" onClick={() => setEditing((v) => !v)}>
              <span lang={lang}>{t("checks.when")}</span>
            </Button>
            <Button
              tone="quiet"
              size="sm"
              onClick={async () => {
                if (!window.confirm(t("checks.stopConfirm"))) return;
                await api(endpoint, { method: "DELETE", auth: "family" });
                await onChanged();
              }}
            >
              <span lang={lang}>{t("checks.stop")}</span>
            </Button>
          </div>
        </div>

        {entering && (
          <div className="mt-3">
            <ReadingEntry checks={[line]} draft={draft} onChange={setDraft} lang={viewerLang} />
            {error && (
              <p role="alert" className="mt-2 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
                {error}
              </p>
            )}
            <Button tone="ink" className="mt-3" onClick={submitReading} disabled={busy || readyReadings([line], draft).length === 0}>
              {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
              <span lang={lang}>{t("meds.save")}</span>
            </Button>
          </div>
        )}

        {editing && (
          // Each change saves on its own, so there is no "did I press save?" question. A failed
          // save surfaces through the global error toaster and the list reloads to the truth.
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <SlotPicker slots={check.slots} onChange={(slots) => void patch({ slots })} lang={viewerLang} />
            <WeekdayPicker weekdays={check.weekdays} onChange={(weekdays) => void patch({ weekdays })} lang={viewerLang} />
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3">
              <input type="checkbox" className="size-5" checked={check.escalates} onChange={(e) => void patch({ escalates: e.target.checked })} />
              <span lang={lang} className="font-medium">
                {t("checks.escalates")}
              </span>
            </label>
            <Button tone="quiet" onClick={() => setEditing(false)}>
              <span lang={lang}>{t("action.back")}</span>
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}
