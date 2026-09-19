import { LANGUAGES, type LanguageCode } from "@dosecircle/shared";
import { Bell, BellOff, CheckCheck, ChevronRight, Loader2, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { InstallGuide } from "../../components/InstallGuide";
import { defaultLanguage, LanguageToggle } from "../../components/LanguagePicker";
import { QrScanner } from "../../components/QrScanner";
import { Logo } from "../../components/Logo";
import { ParentDoseScreen } from "../../components/ParentDoseScreen";
import { Button, cx, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError, mockApiEnabled } from "../../lib/api";
import { pairedDevice, pairPhone, updateStoredLanguage } from "../../lib/device";
import { formatCount } from "../../lib/format";
import { enableReminders, keepSubscriptionFresh, pushSubject, pushSupport } from "../../lib/push";
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
  const [failed, setFailed] = useState(false);
  // "Reminders are on" must be true, not just "permission granted": a phone that granted it before
  // this pairing has nothing registered for it yet, and used to say "on" regardless.
  useEffect(() => {
    const token = pairedDevice()?.token;
    if (permission === "granted" && token) void keepSubscriptionFresh("device", pushSubject.device(token));
  }, [permission]);

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
          setFailed(false);
          try {
            setPermission(await enableReminders("device", pushSubject.device(pairedDevice()?.token ?? "unpaired")));
          } catch {
            // It used to fail silently here, leaving the button as if nothing had been tapped.
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Bell aria-hidden className="size-6" strokeWidth={2.25} />}
        <span lang={lang}>{t("parent.notify.button")}</span>
      </Button>
      {failed && (
        <p lang={lang} role="alert" className="mt-3 text-lg font-medium text-missed">
          {t("parent.notify.failed")}
        </p>
      )}
    </section>
  );
}

function fragment(key: string): string {
  return new URLSearchParams(window.location.hash.slice(1)).get(key) ?? "";
}

/**
 * /join#c=CODE&l=kn — connecting the phone, and nothing else.
 *
 * The family has already set up everything about this person — their name, their language, their
 * medicines — so the phone asks for none of it. It used to ask "what should we call you?", and a
 * test typed "X" and renamed a real person on every family member's screen. Scanning the code (or
 * typing it) connects and goes straight to today's medicines; anything that needs changing is changed
 * by the family in that person's settings.
 *
 * It does not gate connecting behind installing to the home screen — that used to hide the code
 * entry completely, so a parent who could not install was stuck. Install is offered on the next screen.
 */
export function JoinPage() {
  const navigate = useNavigate();
  const linkLang = fragment("l");
  const [chosen, setChosenState] = useState<LanguageCode | null>(
    () => pairedDevice()?.lang ?? (LANGUAGES.some((l) => l.code === linkLang) ? (linkLang as LanguageCode) : defaultLanguage()),
  );
  // Only a language picked on this screen overrides the one the family set up.
  const picked = useRef(false);
  const setChosen = (code: LanguageCode) => {
    picked.current = true;
    setChosenState(code);
  };
  const { t, lang } = useT(chosen ?? "en");
  const [code, setCode] = useState(codeFromFragment);
  const [status, setStatus] = useState<"idle" | "busy" | "invalid">("idle");
  const [scanning, setScanning] = useState(false);
  const tried = useRef(false);
  const hasCode = codeFromFragment().replace(/[^A-Z0-9]/g, "").length >= 8;

  const connect = useCallback(async (scanned?: string) => {
    setStatus("busy");
    try {
      const device = await pairPhone(scanned ?? code);
      if (picked.current && chosen && chosen !== device.lang) {
        await api("/parent/lang", { method: "PUT", auth: "device", body: { lang: chosen } });
        updateStoredLanguage(chosen);
      }
      navigate("/parent", { replace: true, state: { justConnected: true } });
    } catch (error) {
      setStatus(error instanceof ApiError && (error.status === 404 || error.status === 409 || error.status === 400) ? "invalid" : "idle");
    }
  }, [code, chosen, navigate]);

  // A scanned QR carries the code, so there is nothing to type: connect straight away.
  useEffect(() => {
    if (tried.current || !hasCode) return;
    tried.current = true;
    void connect();
  }, [hasCode, connect]);

  // Already connected and no new code: this phone belongs on its today screen.
  if (pairedDevice() && !hasCode) return <Navigate to="/parent" replace />;

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-10 pt-4">
        <div className="flex items-center gap-2.5">
          <Logo className="size-10" />
          <span className="text-xl font-semibold tracking-tight">DoseCircle</span>
        </div>

        {/* The language rides in the family's link, so this is a correction, not a first step:
            small, above the code, and the code box is there whether or not anyone touches it. */}
        <LanguageToggle value={chosen} onChange={setChosen} lang={lang} size="lg" />
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
          <Button tone="ink" size="lg" className="mt-4 min-h-16 w-full text-xl" onClick={() => void connect()} disabled={code.replace(/[^A-Z0-9]/g, "").length < 8 || status === "busy"}>
            {status === "busy" && <Loader2 aria-hidden className="size-6 animate-spin" />}
            <span lang={lang}>{status === "busy" ? t("parent.setup.connecting") : t("parent.join.button")}</span>
          </Button>
          {/* Scanning here connects straight away: no typing an eight-letter code. */}
          <Button tone="quiet" size="lg" className="mt-3 min-h-16 w-full text-xl" onClick={() => setScanning(true)} disabled={status === "busy"}>
            <ScanLine aria-hidden className="size-6" />
            <span lang={lang}>{t("scan.button")}</span>
          </Button>
        </section>
        {scanning && (
          <QrScanner
            lang={lang}
            onClose={() => setScanning(false)}
            onFound={(target) => {
              const scanned = new URLSearchParams(target.split("#")[1] ?? "").get("c") ?? "";
              setCode(scanned);
              void connect(scanned);
            }}
          />
        )}
      </main>
    </div>
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
              <span aria-hidden className="tabular grid size-10 shrink-0 place-items-center rounded-full bg-haldi text-xl font-semibold text-[#172b2a]">
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
  const justConnected = (useLocation().state as { justConnected?: boolean } | null)?.justConnected === true;
  const device = pairedDevice() ?? (mockApiEnabled ? { token: "mock", displayName: "Shantha", lang: "kn" as const } : null);
  const today = useApi(device ? () => api<ParentToday>("/parent/today", { auth: "device" }) : null, [], 60_000);
  // The phone's push subscription can be replaced by the browser; re-register it if so.
  useEffect(() => {
    if (device) void keepSubscriptionFresh("device", pushSubject.device(device.token));
  }, [Boolean(device)]);
  const { t, lang } = useT(today.data?.parent.lang ?? device?.lang ?? "en");

  if (!device) return <Navigate to="/join" replace />;

  const setLanguage = async (code: LanguageCode) => {
    await api("/parent/lang", { method: "PUT", auth: "device", body: { lang: code } });
    updateStoredLanguage(code);
    await today.reload();
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
      <header>
        <div className="flex justify-end">
          {/* Always visible and one tap, instead of a button that unfolded three large cards. */}
          <LanguageToggle value={(today.data?.parent.lang ?? device.lang) as LanguageCode} onChange={setLanguage} lang={lang} size="lg" />
        </div>
        <h1 lang={lang} className="font-display mt-2 text-[40px]">
          {t("parent.today.title")}
        </h1>
      </header>

      {justConnected && (
        <p lang={lang} role="status" className="flex items-center gap-3 rounded-[var(--radius-card)] bg-taken-tint p-4 text-lg font-semibold text-taken">
          <CheckCheck aria-hidden className="size-6 shrink-0" strokeWidth={2.25} />
          {t("parent.join.done")}
        </p>
      )}
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
