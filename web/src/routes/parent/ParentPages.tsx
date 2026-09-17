import type { LanguageCode } from "@dosecircle/shared";
import { Bell, BellOff, ChevronRight, Globe, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { InstallGuide } from "../../components/InstallGuide";
import { defaultLanguage, LanguagePicker } from "../../components/LanguagePicker";
import { Garland } from "../../components/illustrations/Festive";
import { Logo } from "../../components/Logo";
import { ParentDoseScreen } from "../../components/ParentDoseScreen";
import { Button, cx, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError, mockApiEnabled } from "../../lib/api";
import { pairedDevice, pairPhone, updateStoredLanguage } from "../../lib/device";
import { formatCount } from "../../lib/format";
import { enableReminders, isStandalone, pushSupport } from "../../lib/push";
import type { DoseView, ParentToday } from "../../lib/types";
import { useApi } from "../../lib/useApi";

function codeFromFragment(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("c")?.toUpperCase() ?? "";
}

/** Notification permission, asked only after a tap, with plain next steps if it is blocked. */
function RemindersCard({ lang: viewerLang }: { lang: string }) {
  const { t, lang } = useT(viewerLang);
  const support = pushSupport();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const [busy, setBusy] = useState(false);

  if (support !== "supported") return null;
  if (permission === "granted")
    return (
      <p lang={lang} className="flex items-center gap-3 rounded-[var(--radius-card)] bg-taken-tint p-4 text-lg font-medium text-taken">
        <Bell aria-hidden className="size-6 shrink-0" strokeWidth={2.25} />
        {t("parent.notify.ready")}
      </p>
    );
  if (permission === "denied")
    return (
      <p lang={lang} className="flex items-start gap-3 rounded-[var(--radius-card)] bg-missed-tint p-4 text-lg font-medium text-missed">
        <BellOff aria-hidden className="mt-1 size-6 shrink-0" strokeWidth={2.25} />
        {t("parent.notify.blocked")}
      </p>
    );

  return (
    <section className="sticker bg-surface p-5">
      <p lang={lang} className="text-xl font-medium leading-snug">
        {t("parent.notify.why")}
      </p>
      <Button
        tone="ink"
        size="lg"
        className="mt-4 min-h-16 w-full text-xl"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setPermission(await enableReminders("device"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Bell aria-hidden className="size-6" strokeWidth={2.25} />}
        <span lang={lang}>{t("parent.notify.button")}</span>
      </Button>
    </section>
  );
}

/** /join#c=CODE — language first, then install, then the code, then permission. */
export function JoinPage() {
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<LanguageCode | null>(() => pairedDevice()?.lang ?? defaultLanguage());
  const { t, lang } = useT(chosen ?? "en");
  const [code, setCode] = useState(codeFromFragment);
  const [status, setStatus] = useState<"idle" | "busy" | "invalid" | "done">(pairedDevice() ? "done" : "idle");
  const needsInstall = pushSupport() === "needs-install" && !isStandalone();

  const connect = async () => {
    setStatus("busy");
    try {
      const device = await pairPhone(code);
      // The parent's own choice wins over what the family set up.
      if (chosen && chosen !== device.lang) {
        await api("/parent/lang", { method: "PUT", auth: "device", body: { lang: chosen } });
        updateStoredLanguage(chosen);
      }
      setStatus("done");
    } catch (error) {
      setStatus(error instanceof ApiError && (error.status === 404 || error.status === 409 || error.status === 400) ? "invalid" : "idle");
    }
  };

  return (
    <div className="kolam min-h-dvh bg-paper">
    <Garland className="h-10 w-full" count={30} />
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-10 pt-4">
      <div className="flex items-center gap-2.5">
        <Logo className="size-10" />
        <span className="text-2xl font-extrabold">DoseCircle</span>
      </div>

      <LanguagePicker value={chosen} onChange={setChosen} large />

      {chosen && needsInstall && <InstallGuide lang={chosen} code={code || undefined} />}

      {chosen && !needsInstall && status !== "done" && (
        <section className="sticker bg-surface p-5">
          <label htmlFor="code" lang={lang} className="block text-2xl font-semibold leading-snug">
            {t("parent.join.title")}
          </label>
          <input
            id="code"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label={t("parent.join.codeLabel")}
            className="tabular mt-4 h-20 w-full rounded-2xl border-[3px] border-ink bg-haldi-tint text-center font-mono text-4xl font-bold tracking-[0.25em] shadow-[3px_3px_0_var(--color-ink)] focus:bg-surface"
          />
          {status === "invalid" && (
            <p lang={lang} role="alert" className="mt-3 text-lg font-medium text-missed">
              {t("parent.join.invalid")}
            </p>
          )}
          <Button tone="ink" size="lg" className="mt-4 min-h-16 w-full text-xl" onClick={connect} disabled={code.replace(/[^A-Z0-9]/g, "").length < 8 || status === "busy"}>
            {status === "busy" && <Loader2 aria-hidden className="size-6 animate-spin" />}
            <span lang={lang}>{t("parent.join.button")}</span>
          </Button>
        </section>
      )}

      {status === "done" && chosen && (
        <>
          <p lang={lang} className="sticker bg-taken-tint p-4 text-xl font-bold text-taken">
            {t("parent.join.done")}
          </p>
          <RemindersCard lang={chosen} />
          <Button tone="quiet" size="lg" className="min-h-16 text-xl" onClick={() => navigate("/parent")}>
            <span lang={lang}>{t("parent.today.title")}</span>
            <ChevronRight aria-hidden className="size-6" />
          </Button>
        </>
      )}
    </main>
    </div>
  );
}

/** /parent — the calm "today" screen. */
export function ParentHomePage() {
  const device = pairedDevice() ?? (mockApiEnabled ? { token: "mock", displayName: "Shantha", lang: "kn" as const } : null);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const today = useApi(device ? () => api<ParentToday>("/parent/today", { auth: "device" }) : null, [], 60_000);
  const { t, lang } = useT(today.data?.parent.lang ?? device?.lang ?? "en");

  if (!device) return <Navigate to="/join" replace />;

  const setLanguage = async (code: LanguageCode) => {
    await api("/parent/lang", { method: "PUT", auth: "device", body: { lang: code } });
    updateStoredLanguage(code);
    setChangingLanguage(false);
    await today.reload();
  };

  return (
    <main className="kolam mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
      <header>
        <div className="flex justify-end">
          <button type="button" onClick={() => setChangingLanguage((v) => !v)} aria-expanded={changingLanguage} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 text-[16px] font-semibold">
            <Globe aria-hidden className="size-5" strokeWidth={2.25} />
            <span lang={lang}>{t("parent.home.changeLanguage")}</span>
          </button>
        </div>
        <h1 lang={lang} className="font-display mt-2 text-[40px]">
          {t("parent.today.title")}
        </h1>
      </header>

      {changingLanguage && <LanguagePicker value={(today.data?.parent.lang ?? device.lang) as LanguageCode} onChange={setLanguage} large />}

      <InstallGuide lang={lang} />
      <RemindersCard lang={lang} />

      {today.data?.parent.paused && (
        <p lang={lang} className="rounded-[var(--radius-card)] bg-offline-tint p-4 text-xl text-offline">
          {t("parent.today.paused")}
        </p>
      )}

      {today.loading && !today.data ? (
        <div className="grid place-items-center py-16">
          <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />
        </div>
      ) : today.data && today.data.slots.length === 0 ? (
        <p lang={lang} className="text-xl text-muted">
          {t("parent.today.none")}
        </p>
      ) : (
        <ul className="space-y-3">
          {today.data?.slots.map((slot) => {
            const Icon = SLOT_ICONS[slot.slotName];
            const status = slot.dose?.status;
            const done = status === "TAKEN" || status === "TAKEN_LATE";
            const open = status === "PENDING" || status === "ESCALATING" || status === "CLAIMED";
            const body = (
              <>
                <div className="flex items-center gap-3">
                  <Icon aria-hidden className={cx("size-8", done ? "text-taken" : open ? "text-due" : "text-muted")} strokeWidth={2.25} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span lang={lang} className="text-2xl font-semibold">
                        {t(`slot.${slot.slotName}`)}
                      </span>
                      <span className="tabular text-xl text-muted">{slot.time}</span>
                    </p>
                    <p lang={lang} className={cx("text-lg font-medium", done ? "text-taken" : open ? "text-due" : "text-muted")}>
                      {done ? t("parent.status.taken") : status === "CLAIMED" ? t("parent.status.familyHelping") : open ? t("parent.status.waiting") : status === "UNRESOLVED" ? t("parent.status.missed") : t("parent.status.later")}
                    </p>
                  </div>
                  {open && <ChevronRight aria-hidden className="size-7 text-ink" />}
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {slot.medicines.map((m) => (
                    <li key={m.medId} className="inline-flex items-center gap-2 rounded-full bg-paper py-1 pl-1 pr-3 text-lg">
                      <span className="tabular grid size-8 place-items-center rounded-full bg-haldi-tint font-semibold">{formatCount(m.count)}</span>
                      <span lang="en" className="medicine-name font-semibold">
                        {m.nameAsPrinted}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            );
            return (
              <li key={slot.slotName}>
                {open && slot.dose ? (
                  <Link to={`/parent/dose/${encodeURIComponent(slot.dose.doseId)}`} className="sticker pressable block bg-haldi-tint p-4">
                    {body}
                  </Link>
                ) : (
                  <div className={cx("sticker-sm p-4", done ? "bg-taken-tint" : "bg-surface")}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p lang={lang} className="mt-auto text-[15px] text-muted">
        {t("parent.home.battery")}
      </p>
    </main>
  );
}

/** /parent/dose/:doseId — opened from the reminder notification. */
export function ParentDosePage() {
  const { doseId = "" } = useParams();
  const device = pairedDevice() ?? (mockApiEnabled ? { token: "mock" } : null);
  const dose = useApi(device ? () => api<DoseView>(`/parent/doses/${encodeURIComponent(doseId)}`, { auth: "device" }) : null, [doseId], 15_000);

  useEffect(() => {
    document.documentElement.lang = dose.data?.parent.lang ?? "en";
  }, [dose.data?.parent.lang]);

  if (!device) return <Navigate to="/join" replace />;
  if (!dose.data)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 aria-hidden className="size-8 animate-spin text-muted" />
      </div>
    );

  return (
    <div className="mx-auto h-dvh max-w-xl">
      <ParentDoseScreen
        dose={dose.data}
        autoPlay
        onTaken={async ({ keepalive }) => {
          await api(`/parent/doses/${encodeURIComponent(doseId)}/taken`, { method: "POST", auth: "device", keepalive });
        }}
      />
    </div>
  );
}
