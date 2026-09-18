import { LANGUAGES, type LanguageCode } from "@dosecircle/shared";
import { Bell, BellOff, Camera, CheckCheck, ChevronRight, Globe, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { InstallGuide } from "../../components/InstallGuide";
import { defaultLanguage, LanguagePicker } from "../../components/LanguagePicker";
import { Logo } from "../../components/Logo";
import { ParentDoseScreen } from "../../components/ParentDoseScreen";
import { Button, cx, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError, mockApiEnabled } from "../../lib/api";
import { pairedDevice, pairPhone, updateStoredLanguage } from "../../lib/device";
import { formatCount } from "../../lib/format";
import { enableReminders, isStandalone, keepSubscriptionFresh, pushSupport } from "../../lib/push";
import { uploadBoth } from "../../lib/prescription-upload";
import type { DoseView, ParentToday, PresignedPost } from "../../lib/types";
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

function fragment(key: string): string {
  return new URLSearchParams(window.location.hash.slice(1)).get(key) ?? "";
}

/**
 * /join#c=CODE&l=kn — the dependent's whole setup: scan, name, an optional prescription, done.
 *
 * Three things this deliberately does not do. It does not open on a language picker: the family
 * already chose one and it rides in the link, so the first words are in the reader's own script.
 * It does not make them type a code that is already in the link. And it does not gate connecting
 * behind installing to the home screen — that used to hide the code entry completely, so a parent
 * who could not install was stuck and the family saw no sign the link had even arrived. Connecting
 * is what tells the family it worked, so it happens first and install is offered afterwards.
 */
export function JoinPage() {
  const navigate = useNavigate();
  const linkLang = fragment("l");
  const [chosen, setChosen] = useState<LanguageCode | null>(
    () => pairedDevice()?.lang ?? (LANGUAGES.some((l) => l.code === linkLang) ? (linkLang as LanguageCode) : defaultLanguage()),
  );
  const { t, lang } = useT(chosen ?? "en");
  const [code, setCode] = useState(codeFromFragment);
  const [step, setStep] = useState<"connect" | "name" | "prescription" | "done">(pairedDevice() ? "name" : "connect");
  const [status, setStatus] = useState<"idle" | "busy" | "invalid">("idle");
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const needsInstall = pushSupport() === "needs-install" && !isStandalone();
  const tried = useRef(false);

  const connect = useCallback(async () => {
    setStatus("busy");
    try {
      const device = await pairPhone(code);
      // The parent's own choice wins over what the family set up.
      if (chosen && chosen !== device.lang) {
        await api("/parent/lang", { method: "PUT", auth: "device", body: { lang: chosen } });
        updateStoredLanguage(chosen);
      }
      setName(device.displayName ?? "");
      setStatus("idle");
      setStep("name");
    } catch (error) {
      setStatus(error instanceof ApiError && (error.status === 404 || error.status === 409 || error.status === 400) ? "invalid" : "idle");
    }
  }, [code, chosen]);

  // A scanned QR carries the code, so there is nothing to type: connect straight away.
  useEffect(() => {
    if (tried.current || step !== "connect" || codeFromFragment().replace(/[^A-Z0-9]/g, "").length < 8) return;
    tried.current = true;
    void connect();
  }, [step, connect]);

  const saveName = async () => {
    setSavingName(true);
    try {
      if (name.trim()) await api("/parent/name", { method: "PUT", auth: "device", body: { displayName: name.trim() } });
      setStep("prescription");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-10 pt-4">
        <div className="flex items-center gap-2.5">
          <Logo className="size-10" />
          <span className="text-xl font-semibold tracking-tight">DoseCircle</span>
        </div>

        {step === "connect" && (
          <>
            <LanguagePicker value={chosen} onChange={setChosen} large />
            {chosen && (
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
                  className="tabular mt-4 h-20 w-full rounded-2xl border border-line-strong bg-paper text-center font-mono text-4xl font-semibold tracking-[0.25em] focus:border-indigo focus:bg-surface focus:outline-none"
                />
                {status === "invalid" && (
                  <p lang={lang} role="alert" className="mt-3 text-lg font-medium text-missed">
                    {t("parent.join.invalid")}
                  </p>
                )}
                <Button tone="ink" size="lg" className="mt-4 min-h-16 w-full text-xl" onClick={connect} disabled={code.replace(/[^A-Z0-9]/g, "").length < 8 || status === "busy"}>
                  {status === "busy" && <Loader2 aria-hidden className="size-6 animate-spin" />}
                  <span lang={lang}>{status === "busy" ? t("parent.setup.connecting") : t("parent.join.button")}</span>
                </Button>
              </section>
            )}
          </>
        )}

        {step === "name" && (
          <section className="sticker bg-surface p-5">
            <p lang={lang} className="mb-3 text-lg font-semibold text-taken">
              {t("parent.join.done")}
            </p>
            <label htmlFor="parent-name" lang={lang} className="block text-2xl font-semibold leading-snug">
              {t("parent.setup.nameTitle")}
            </label>
            <p lang={lang} className="mt-1 text-lg text-muted">
              {t("parent.setup.nameHelp")}
            </p>
            <input
              id="parent-name"
              autoComplete="name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-4 h-20 w-full rounded-2xl border border-line-strong bg-paper px-4 text-3xl font-semibold focus:border-indigo focus:bg-surface focus:outline-none"
            />
            <Button tone="ink" size="lg" className="mt-4 min-h-16 w-full text-xl" onClick={saveName} disabled={savingName}>
              {savingName && <Loader2 aria-hidden className="size-6 animate-spin" />}
              <span lang={lang}>{t("onboard.next")}</span>
            </Button>
          </section>
        )}

        {step === "prescription" && chosen && (
          <ParentPrescriptionStep lang={chosen} onDone={() => setStep("done")} />
        )}

        {step === "done" && chosen && (
          <>
            {needsInstall && <InstallGuide lang={chosen} />}
            <RemindersCard lang={chosen} />
            <Button tone="ink" size="lg" className="min-h-16 text-xl" onClick={() => navigate("/parent")}>
              <span lang={lang}>{t("parent.today.title")}</span>
              <ChevronRight aria-hidden className="size-6" />
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * The optional last step of a parent's setup: photograph the prescription you are holding.
 *
 * The parent can start the reading but never finishes it — the draft goes to the family, who tick
 * every line before a single medicine is saved. That keeps the confirmation with the person best
 * placed to check it against the paper, and it is why this screen promises nothing more than
 * "sent to your family".
 */
function ParentPrescriptionStep({ lang: parentLang, onDone }: { lang: LanguageCode; onDone: () => void }) {
  const { t, lang } = useT(parentLang);
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");

  const send = async (file: File) => {
    setState("busy");
    try {
      const started = await api<{ uploads: { model: PresignedPost; original: PresignedPost } }>("/parent/prescriptions", {
        method: "POST",
        auth: "device",
        body: { consent: true },
      });
      await uploadBoth(started.uploads, file);
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <section className="sticker bg-surface p-5">
      <h2 lang={lang} className="text-2xl font-semibold leading-snug">
        {t("parent.setup.rxTitle")}
      </h2>
      <p lang={lang} className="mt-2 text-lg text-muted">
        {t("parent.setup.rxHelp")}
      </p>

      {state === "sent" ? (
        <p lang={lang} className="mt-4 rounded-2xl bg-taken-tint p-4 text-lg font-semibold text-taken">
          {t("parent.setup.rxSent")}
        </p>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void send(file);
            }}
          />
          <Button tone="ink" size="lg" className="mt-4 min-h-16 w-full text-xl" disabled={state === "busy"} onClick={() => input.current?.click()}>
            {state === "busy" ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Camera aria-hidden className="size-6" strokeWidth={2.25} />}
            <span lang={lang}>{t("parent.setup.rxTake")}</span>
          </Button>
          {state === "failed" && (
            <p lang={lang} role="alert" className="mt-3 text-lg font-medium text-missed">
              {t("common.error")}
            </p>
          )}
          <p lang={lang} className="mt-3 text-[15px] text-muted">
            {t("parent.setup.rxConsent")}
          </p>
        </>
      )}

      <Button tone="quiet" size="lg" className="mt-4 min-h-16 w-full text-xl" onClick={onDone}>
        <span lang={lang}>{state === "sent" ? t("parent.setup.finish") : t("parent.setup.skip")}</span>
      </Button>
    </section>
  );
}

/**
 * What the parent sees when there is nothing on the list. The old screen said "No medicines are due
 * today" and stopped there, which leaves an elderly person with no idea whether the app is working,
 * who puts medicines on it, or what will happen next — and nothing on this screen is theirs to fix.
 * So it answers those three questions instead, and says the reassuring thing plainly: you do not
 * have to remember.
 */
function NothingToday({ hasSchedule, lang: parentLang }: { hasSchedule: boolean; lang: LanguageCode }) {
  const { t, lang } = useT(parentLang);
  const steps = [t("parent.today.step1"), t("parent.today.step2"), t("parent.today.step3")];

  return (
    <div className="space-y-5">
      <div className="sticker bg-surface p-6 text-center">
        <span aria-hidden className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-taken-tint text-taken">
          <CheckCheck className="size-11" strokeWidth={2.25} />
        </span>
        <p lang={lang} className="text-[26px] font-semibold leading-tight text-ink">
          {hasSchedule ? t("parent.today.noneToday") : t("parent.today.nothingYet")}
        </p>
        <p lang={lang} className="mt-3 text-xl leading-relaxed text-muted">
          {hasSchedule ? t("parent.today.weWillTell") : t("parent.today.familyAdds")}
        </p>
      </div>

      <section className="sticker bg-surface p-6" aria-labelledby="what-happens">
        <h2 id="what-happens" lang={lang} className="text-xl font-semibold text-ink">
          {t("parent.today.whatHappens")}
        </h2>
        <ol className="mt-4 space-y-4">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-4">
              <span aria-hidden className="tabular grid size-10 shrink-0 place-items-center rounded-full bg-haldi text-xl font-semibold text-[#14133a]">
                {index + 1}
              </span>
              <span lang={lang} className="pt-1 text-lg leading-snug text-ink">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** /parent — the calm "today" screen. */
export function ParentHomePage() {
  const device = pairedDevice() ?? (mockApiEnabled ? { token: "mock", displayName: "Shantha", lang: "kn" as const } : null);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const today = useApi(device ? () => api<ParentToday>("/parent/today", { auth: "device" }) : null, [], 60_000);
  // The phone's push subscription can be replaced by the browser; re-register it if so.
  useEffect(() => {
    if (device) void keepSubscriptionFresh("device");
  }, [Boolean(device)]);
  const { t, lang } = useT(today.data?.parent.lang ?? device?.lang ?? "en");

  if (!device) return <Navigate to="/join" replace />;

  const setLanguage = async (code: LanguageCode) => {
    await api("/parent/lang", { method: "PUT", auth: "device", body: { lang: code } });
    updateStoredLanguage(code);
    setChangingLanguage(false);
    await today.reload();
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
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
        <NothingToday hasSchedule={today.data.hasSchedule} lang={today.data.parent.lang} />
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
                  {slot.checks.map((check) => (
                    <li
                      key={check.checkId}
                      className={cx("inline-flex items-center gap-2 rounded-full py-1 pl-3 pr-3 text-lg", check.recorded ? "bg-taken-tint text-taken" : "bg-paper")}
                    >
                      <span lang={lang} className="font-semibold">
                        {t(`check.${check.type}`)}
                      </span>
                      {check.recorded && (
                        <span lang="en" className="tabular font-semibold">
                          {check.recorded.text}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            );
            return (
              <li key={slot.slotName}>
                {open && slot.dose ? (
                  <Link to={`/parent/dose/${encodeURIComponent(slot.dose.doseId)}`} className="sticker pressable block bg-surface p-4 ring-2 ring-haldi">
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
        onTaken={async ({ keepalive, readings }) => {
          await api(`/parent/doses/${encodeURIComponent(doseId)}/taken`, { method: "POST", auth: "device", keepalive, body: { readings } });
        }}
      />
    </div>
  );
}
