import type { LanguageCode } from "@dosecircle/shared";
import { ArrowLeft, Bell, BellOff, Loader2, ScanLine, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Field, inputClass } from "../../components/FamilyShell";
import { defaultLanguage, LanguageToggle } from "../../components/LanguagePicker";
import { QrScanner } from "../../components/QrScanner";
import { Logo } from "../../components/Logo";
import { ShareInvite } from "../../components/ShareInvite";
import { Button, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError, mockApiEnabled } from "../../lib/api";
import { authConfigured, confirmAccount, createAccount, finishPasswordReset, requestPasswordReset, signInWithEmail, signOut } from "../../lib/auth";
import { useFamily } from "../../lib/family";
import { enableReminders, pushSubject, pushSupport } from "../../lib/push";

function preferredLanguage(): LanguageCode {
  return defaultLanguage() ?? "en";
}

/**
 * `exit` is the way out, top right, on every breakpoint. The logo was the only way back before, and
 * a logo is not where anyone looks for "cancel".
 */
function AuthLayout({ children, exit }: { children: React.ReactNode; exit?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1fr_1.1fr]">
      {/* Same white-and-blue as the landing page, so signing in feels like the next step of the
          same place rather than a different app. */}
      <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 lg:block">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgb(37_99_235/0.10)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(80%_70%_at_30%_70%,black,transparent_80%)]" />
        <div className="relative flex h-full flex-col p-12">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-10 rounded-[10px]" />
            <span className="text-xl font-semibold tracking-tight text-ink">DoseCircle</span>
          </Link>
          <p className="font-display mt-auto max-w-md text-5xl leading-[1.08] tracking-tight text-ink">
            The right person knows, <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">every time.</span>
          </p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">Reminders in each person's own language, and a family that is asked one person at a time when a dose is missed.</p>
        </div>
      </aside>
      <main className="flex flex-col px-4 py-5 sm:px-10">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 lg:invisible">
            <Logo className="size-8 rounded-[9px]" />
            <span className="text-[17px] font-semibold tracking-tight">DoseCircle</span>
          </Link>
          {exit}
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-8">{children}</div>
      </main>
    </div>
  );
}

const exitClass = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-muted hover:bg-sunken hover:text-ink";

function HomeLink({ label, lang }: { label: string; lang: string }) {
  return (
    <Link to="/" className={exitClass}>
      <ArrowLeft aria-hidden className="size-4.5" />
      <span lang={lang}>{label}</span>
    </Link>
  );
}

/**
 * Leaving setup half way signs out as well. Staying signed in with no family would send every later
 * "Sign in" or "Get started" straight back into this form, which is its own kind of trap.
 */
function CancelSetup({ label, lang }: { label: string; lang: string }) {
  const navigate = useNavigate();
  const { reload } = useFamily();
  return (
    <button
      type="button"
      className={exitClass}
      onClick={async () => {
        await signOut();
        // Same order as Settings: leave first, then refresh, so the stale "no family yet" state
        // cannot bounce the next "Sign in" straight back into this form.
        navigate("/", { replace: true });
        await reload();
      }}
    >
      <X aria-hidden className="size-4.5" />
      <span lang={lang}>{label}</span>
    </button>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** /signin — email and password for family members. */
export function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, reload } = useFamily();
  const { t, lang } = useT(preferredLanguage());
  // The landing page sends new families straight to "create" so they don't land on a sign-in form
  // for an account they don't have yet.
  const [mode, setMode] = useState<Mode>(params.get("mode") === "create" ? "create" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [scanning, setScanning] = useState(false);
  const next = params.get("next") ?? "/home";

  if (state.status === "ready") return <Navigate to={next} replace />;
  if (state.status === "noFamily" && !next.startsWith("/invite")) return <Navigate to="/onboarding" replace />;

  const switchTo = (to: Mode) => {
    setMode(to);
    setError(null);
    setCode("");
    setResent(false);
    // The old password is useless once someone has said they forgot it, and a browser would
    // otherwise carry it into the "new password" box.
    if (to === "forgot" || to === "reset") setPassword("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await requestPasswordReset(email);
        switchTo("reset");
        return;
      }
      if (mode === "reset") await finishPasswordReset(email, code, password);
      else if (mode === "confirm") await confirmAccount(email, password, code);
      else {
        const result = mode === "signIn" ? await signInWithEmail(email, password) : await createAccount(email, password);
        if (result === "confirm") {
          setMode("confirm");
          return;
        }
        if (mode === "create") await signInWithEmail(email, password);
      }
      await reload();
      navigate(next, { replace: true });
    } catch (e) {
      setError(authErrorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await requestPasswordReset(email);
      setResent(true);
    } catch (e) {
      setError(authErrorText(e, t));
    }
  };

  if (!authConfigured && !mockApiEnabled)
    return (
      <AuthLayout>
        <p lang={lang} className="mt-10 rounded-[var(--radius-card)] bg-offline-tint p-4 text-lg text-offline">
          {t("auth.notConfigured")}
        </p>
        <Link to="/demo" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[var(--radius-button)] bg-ink px-5 font-semibold text-paper">
          Live demo
        </Link>
      </AuthLayout>
    );

  const title = { signIn: "auth.title.signIn", create: "auth.title.create", confirm: "auth.confirmTitle", forgot: "auth.forgotTitle", reset: "auth.resetTitle" }[mode];
  const button = { signIn: "auth.signInButton", create: "auth.createButton", confirm: "auth.confirmButton", forgot: "auth.sendCode", reset: "auth.resetButton" }[mode];
  const recovering = mode === "forgot" || mode === "reset";

  return (
    <AuthLayout exit={<HomeLink label={t("auth.backHome")} lang={lang} />}>
      <form onSubmit={submit} className="space-y-4">
        <h1 lang={lang} className="font-display text-[32px] leading-tight md:text-[38px]">
          {t(title)}
        </h1>
        {mode === "forgot" && (
          <p lang={lang} className="text-[16px] text-muted">
            {t("auth.forgotHelp")}
          </p>
        )}
        {mode === "reset" && (
          <p lang={lang} className="text-[16px] text-muted">
            {t("auth.resetHelp")} <span className="font-semibold text-ink">{email}</span>
          </p>
        )}

        {(mode === "signIn" || mode === "create" || mode === "forgot") && (
          <Field label={t("auth.email")} lang={lang}>
            <input className={inputClass} type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        {(mode === "signIn" || mode === "create") && (
          <Field label={t("auth.password")} hint={mode === "create" ? t("auth.passwordHint") : undefined} lang={lang}>
            <input className={inputClass} type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {/* Sits right under the password box, where someone who has just got it wrong is looking. */}
        {mode === "signIn" && (
          <button type="button" onClick={() => switchTo("forgot")} className="-mt-1 min-h-10 text-[15px] font-semibold text-claimed underline-offset-2 hover:underline">
            <span lang={lang}>{t("auth.forgot")}</span>
          </button>
        )}

        {(mode === "confirm" || mode === "reset") && (
          <Field label={t("auth.resetCode")} lang={lang}>
            <input className={`${inputClass} tabular text-center font-mono text-2xl tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))} />
          </Field>
        )}
        {mode === "reset" && (
          <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")} lang={lang}>
            <input className={inputClass} type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}

        {error && (
          <p role="alert" lang={lang} className="rounded-xl bg-missed-tint px-3 py-2 text-[15px] font-medium text-missed">
            {error}
          </p>
        )}
        {resent && (
          <p role="status" lang={lang} className="rounded-xl bg-taken-tint px-3 py-2 text-[15px] font-medium text-taken">
            {t("auth.codeResent")}
          </p>
        )}
        <Button tone="ink" size="lg" type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          <span lang={lang}>{t(button)}</span>
        </Button>

        {(mode === "signIn" || mode === "create") && (
          <button type="button" onClick={() => switchTo(mode === "signIn" ? "create" : "signIn")} className="block min-h-11 w-full text-center text-[15px] font-semibold text-claimed">
            <span lang={lang}>{mode === "signIn" ? t("auth.switchToCreate") : t("auth.switchToSignIn")}</span>
          </button>
        )}
        {recovering && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => switchTo("signIn")} className="min-h-11 text-[15px] font-semibold text-claimed">
              <span lang={lang}>{t("auth.backToSignIn")}</span>
            </button>
            {mode === "reset" && (
              <button type="button" onClick={() => void resend()} className="min-h-11 text-[15px] font-semibold text-claimed">
                <span lang={lang}>{t("auth.resendCode")}</span>
              </button>
            )}
          </div>
        )}
      </form>
      {/* The other kind of person who lands here: the one taking the medicines, who has no account
          and needs none. They used to get one grey line telling them to find the link again; now
          they can scan the family's code right here. */}
      {!recovering && (
        <div className="mt-8 rounded-2xl bg-blue-50/70 p-4 ring-1 ring-blue-100">
          <p lang={lang} className="font-semibold text-ink">
            {t("auth.forMedicines")}
          </p>
          <p lang={lang} className="mt-0.5 text-[14.5px] text-muted">
            {t("auth.forMedicinesHelp")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setScanning(true)} className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[15px] font-semibold text-white hover:bg-blue-700">
              <ScanLine aria-hidden className="size-4.5" />
              <span lang={lang}>{t("scan.button")}</span>
            </button>
            <Link to="/join" className="inline-flex min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold text-blue-700 hover:bg-blue-100/60">
              <span lang={lang}>{t("scan.typeShort")}</span>
            </Link>
          </div>
        </div>
      )}
      {scanning && <QrScanner lang={lang} onClose={() => setScanning(false)} />}
    </AuthLayout>
  );
}

type Mode = "signIn" | "create" | "confirm" | "forgot" | "reset";

/**
 * Cognito's own messages are English and written for developers ("Invalid verification code
 * provided, please try again."). The ones a person hits while recovering an account get a reviewed
 * sentence in their language; anything rarer falls through as Cognito wrote it.
 */
function authErrorText(error: unknown, t: (key: string) => string): string {
  const name = (error as { name?: string } | null)?.name;
  const key = {
    CodeMismatchException: "auth.error.wrongCode",
    ExpiredCodeException: "auth.error.expiredCode",
    InvalidPasswordException: "auth.passwordHint",
    LimitExceededException: "auth.error.tooMany",
    TooManyRequestsException: "auth.error.tooMany",
    NotAuthorizedException: "auth.error.wrongPassword",
  }[name ?? ""];
  return key ? t(key) : errorText(error);
}

/** Shows the phone-pairing link as a WhatsApp share, a copy button and a QR code. */
export function PhoneInvite({ fid, pid, parentName, lang: viewerLang }: { fid: string; pid: string; parentName: string; lang: string }) {
  const { t, lang } = useT(viewerLang);
  const [invite, setInvite] = useState<{ link: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try {
      setInvite(await api<{ link: string; code: string }>(`/families/${fid}/invites`, { method: "POST", auth: "family", body: { kind: "parent", pid } }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!invite)
    return (
      <div>
        <Button tone="ink" size="lg" onClick={create}>
          <span lang={lang}>{t("onboard.connectPhone")}</span>
        </Button>
        {error && <p className="mt-2 text-missed">{error}</p>}
      </div>
    );

  return (
    <div className="sticker bg-surface p-4">
      <p className="text-lg font-semibold">{parentName}</p>
      <div className="mt-1">
        <ShareInvite link={invite.link} code={invite.code} message={t("onboard.shareMessage")} help={t("onboard.connectPhoneHelp")} lang={viewerLang} />
      </div>
    </div>
  );
}

/**
 * The family member's own alerts. Every state says what is going on: asking, working, blocked by the
 * browser (with where to unblock it), an iPhone that has to install the app first, or a failure. It
 * used to show one button whatever happened — blocked, it did nothing; failing, it did nothing.
 */
export function EnableMyAlerts({ lang: viewerLang }: { lang: string }) {
  const { t, lang } = useT(viewerLang);
  const { state } = useFamily();
  const support = pushSupport();
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (support === "unsupported" || permission === "granted") return null;

  const note = (tone: "info" | "blocked", key: string) => (
    <p lang={lang} role={tone === "blocked" ? "alert" : undefined} className={cx("sticker flex items-start gap-3 p-4 text-[15px] font-medium", tone === "blocked" ? "bg-missed-tint text-missed" : "bg-surface text-ink")}>
      {tone === "blocked" ? <BellOff aria-hidden className="mt-0.5 size-5 shrink-0" /> : <Bell aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />}
      {t(key)}
    </p>
  );
  if (support === "needs-install") return note("info", "onboard.enableInstall");
  if (permission === "denied") return note("blocked", "onboard.enableBlocked");

  return (
    <div className="sticker flex flex-col items-start gap-3 bg-surface p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p lang={lang} className="text-[15.5px] font-medium text-ink">
          {t("onboard.enableMineHelp")}
        </p>
        {failed && (
          <p lang={lang} role="alert" className="mt-1 text-[14px] font-medium text-missed">
            {t("onboard.enableFailed")}
          </p>
        )}
      </div>
      <Button
        tone="haldi"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            // Before the family is created there is no member id yet; the next launch registers
            // it again under the right one.
            setPermission(await enableReminders("family", pushSubject.member(state.status === "ready" ? state.me.mid : "pending")));
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Bell aria-hidden className="size-5" strokeWidth={2.25} />}
        <span lang={lang}>{t("onboard.enableMine")}</span>
      </Button>
    </div>
  );
}

/** /onboarding — create a family circle with one parent, then connect their phone. */
export function OnboardingPage() {
  const { state, reload } = useFamily();
  const navigate = useNavigate();
  const [myLang, setMyLang] = useState<LanguageCode>(preferredLanguage);
  const { t, lang } = useT(myLang);
  const [form, setForm] = useState({ displayName: "", relation: "", parentName: "", parentLang: "en" as LanguageCode | null, familyName: "" });
  const [created, setCreated] = useState<{ fid: string; pid: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "signedOut") return <Navigate to="/signin?next=/onboarding" replace />;
  if (state.status === "ready" && !created) return <Navigate to="/home" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.parentLang) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ fid: string; pid: string }>("/families", {
        method: "POST",
        auth: "family",
        body: {
          familyName: form.familyName.trim() || form.parentName.trim(),
          me: { displayName: form.displayName.trim(), relation: form.relation.trim() || undefined, lang: myLang },
          parent: { displayName: form.parentName.trim(), lang: form.parentLang },
        },
      });
      setCreated(result);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? "You already belong to a family circle." : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout exit={!created ? <CancelSetup label={t("auth.cancel")} lang={lang} /> : undefined}>
      <h1 lang={lang} className="font-display text-[32px] leading-tight md:text-[38px]">
        {t("onboard.title")}
      </h1>
      {!created ? (
        <form onSubmit={submit} className="mt-2">
          <p lang={lang} className="text-[15.5px] leading-relaxed text-muted">
            {t("onboard.intro")}
          </p>
          {/* Two short groups instead of one long column: who you are, then who you look after.
              Each language question sits inside the group it belongs to. */}
          <section className="mt-7 space-y-4">
            <h2 lang={lang} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              {t("onboard.you")}
            </h2>
            <Field label={t("onboard.yourName")} lang={lang}>
              <input className={inputClass} required maxLength={40} autoComplete="name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </Field>
            <Field label={t("onboard.relation")} lang={lang}>
              <input className={inputClass} maxLength={30} placeholder={t("onboard.relationPlaceholder")} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
            </Field>
            <LanguageToggle value={myLang} onChange={setMyLang} label={t("onboard.yourLanguage")} lang={lang} />
          </section>
          <section className="mt-7 space-y-4 border-t border-line pt-7">
            <h2 lang={lang} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              {t("onboard.parent")}
            </h2>
            <Field label={t("onboard.parentName")} lang={lang}>
              <input className={inputClass} required maxLength={40} value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />
            </Field>
            <LanguageToggle value={form.parentLang} onChange={(code) => setForm({ ...form, parentLang: code })} label={t("onboard.parentLanguage")} lang={lang} />
          </section>
          {error && (
            <p role="alert" className="mt-6 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
              {error}
            </p>
          )}
          <Button tone="ink" size="lg" type="submit" className="mt-8 w-full" disabled={busy || !form.parentLang}>
            {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
            <span lang={lang}>{t("onboard.create")}</span>
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-5">
          <PhoneInvite fid={created.fid} pid={created.pid} parentName={form.parentName} lang={myLang} />
          <EnableMyAlerts lang={myLang} />
          <Button
            tone="ink"
            size="lg"
            className="w-full"
            onClick={async () => {
              await reload();
              navigate("/home");
            }}
          >
            <span lang={lang}>{t("onboard.done")}</span>
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}

/** /invite#c=CODE — a family member joins an existing circle. */
export function InviteAcceptPage() {
  const { state, reload } = useFamily();
  const navigate = useNavigate();
  const [code] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("c") ?? "");
  const [myLang, setMyLang] = useState<LanguageCode>(preferredLanguage);
  const { t, lang } = useT(myLang);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (code) sessionStorage.setItem("dosecircle.invite", code);
  }, [code]);

  if (state.status === "signedOut") return <Navigate to={`/signin?next=${encodeURIComponent(`/invite#c=${code}`)}`} replace />;
  if (state.status === "ready") return <Navigate to="/home" replace />;

  return (
    <AuthLayout exit={<CancelSetup label={t("auth.cancel")} lang={lang} />}>
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api("/invites/accept", { method: "POST", auth: "family", body: { code: code || sessionStorage.getItem("dosecircle.invite"), displayName: name.trim(), relation: relation.trim() || undefined, lang: myLang } });
            await reload();
            navigate("/home");
          } catch {
            setError(true);
          }
        }}
      >
        <h1 lang={lang} className="font-display text-[32px] leading-tight md:text-[38px]">
          {t("invite.title")}
        </h1>
        <Field label={t("onboard.yourName")} lang={lang}>
          <input className={inputClass} required maxLength={40} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("onboard.relation")} lang={lang}>
          <input className={inputClass} maxLength={30} placeholder={t("onboard.relationPlaceholder")} value={relation} onChange={(e) => setRelation(e.target.value)} />
        </Field>
        <LanguageToggle value={myLang} onChange={setMyLang} label={t("onboard.yourLanguage")} lang={lang} />
        {error && (
          <p lang={lang} role="alert" className="rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
            {t("invite.invalid")}
          </p>
        )}
        <Button tone="ink" size="lg" type="submit" className="w-full">
          <span lang={lang}>{t("invite.join")}</span>
        </Button>
      </form>
    </AuthLayout>
  );
}
