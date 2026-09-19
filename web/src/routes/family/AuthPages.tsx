import type { LanguageCode } from "@dosecircle/shared";
import { Bell, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Field, inputClass } from "../../components/FamilyShell";
import { defaultLanguage, LanguagePicker } from "../../components/LanguagePicker";
import { Logo } from "../../components/Logo";
import { ShareInvite } from "../../components/ShareInvite";
import { Button } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError, mockApiEnabled } from "../../lib/api";
import { authConfigured, confirmAccount, createAccount, signInWithEmail } from "../../lib/auth";
import { useFamily } from "../../lib/family";
import { enableReminders, pushSupport } from "../../lib/push";

function preferredLanguage(): LanguageCode {
  return defaultLanguage() ?? "en";
}

function AuthLayout({ children }: { children: React.ReactNode }) {
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
      <main className="flex flex-col px-4 py-8 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5 lg:hidden">
          <Logo className="size-9" />
          <span className="text-lg font-semibold tracking-tight">DoseCircle</span>
        </Link>
        <div className="mx-auto my-auto w-full max-w-md py-10">{children}</div>
      </main>
    </div>
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
  const [mode, setMode] = useState<"signIn" | "create" | "confirm">(params.get("mode") === "create" ? "create" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") ?? "/home";

  if (state.status === "ready") return <Navigate to={next} replace />;
  if (state.status === "noFamily" && !next.startsWith("/invite")) return <Navigate to="/onboarding" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "confirm") await confirmAccount(email, password, code);
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
      setError(errorText(e));
    } finally {
      setBusy(false);
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

  return (
    <AuthLayout>
      <form onSubmit={submit} className="space-y-4">
        <h1 lang={lang} className="font-display text-4xl md:text-[44px]">
          {mode === "create" ? t("auth.title.create") : mode === "confirm" ? t("auth.confirmTitle") : t("auth.title.signIn")}
        </h1>
        {mode !== "confirm" ? (
          <>
            <Field label={t("auth.email")} lang={lang}>
              <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("auth.password")} hint={mode === "create" ? t("auth.passwordHint") : undefined} lang={lang}>
              <input className={inputClass} type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <input className={`${inputClass} tabular text-center font-mono text-2xl tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-missed-tint px-3 py-2 text-[15px] font-medium text-missed">
            {error}
          </p>
        )}
        <Button tone="ink" size="lg" type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
          <span lang={lang}>{mode === "create" ? t("auth.createButton") : mode === "confirm" ? t("auth.confirmButton") : t("auth.signInButton")}</span>
        </Button>
        {mode !== "confirm" && (
          <button type="button" onClick={() => setMode(mode === "signIn" ? "create" : "signIn")} className="block min-h-11 w-full text-center text-[15px] font-semibold text-claimed">
            <span lang={lang}>{mode === "signIn" ? t("auth.switchToCreate") : t("auth.switchToSignIn")}</span>
          </button>
        )}
      </form>
      <p lang={lang} className="mt-6 border-t-2 border-dashed border-ink/20 pt-4 text-[14px] text-muted">
        {t("auth.parentHint")}
      </p>
    </AuthLayout>
  );
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

export function EnableMyAlerts({ lang: viewerLang }: { lang: string }) {
  const { t, lang } = useT(viewerLang);
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  if (pushSupport() !== "supported" || permission === "granted") return null;
  return (
    <div className="sticker flex flex-col items-start gap-3 bg-surface p-4 sm:flex-row sm:items-center sm:gap-4">
      <p lang={lang} className="min-w-0 flex-1 text-[15.5px] font-medium text-ink">
        {t("onboard.enableMineHelp")}
      </p>
      <Button tone="haldi" onClick={async () => setPermission(await enableReminders("family"))}>
        <Bell aria-hidden className="size-5" strokeWidth={2.25} />
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
  const [form, setForm] = useState({ displayName: "", relation: "", parentName: "", parentLang: null as LanguageCode | null, familyName: "" });
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
    <AuthLayout>
      <h1 lang={lang} className="font-display text-4xl md:text-[44px]">
        {t("onboard.title")}
      </h1>
      {!created ? (
        <form onSubmit={submit} className="mt-6 space-y-6">
          <p lang={lang} className="text-[16px] text-muted">
            {t("onboard.intro")}
          </p>
          <div>
            <p lang={lang} className="mb-2 text-[15px] font-semibold">
              {t("lang.choose")}
            </p>
            <LanguagePicker value={myLang} onChange={setMyLang} />
          </div>
          <section className="space-y-4">
            <h2 lang={lang} className="text-xl font-semibold">
              {t("onboard.you")}
            </h2>
            <Field label={t("onboard.yourName")} lang={lang}>
              <input className={inputClass} required maxLength={40} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </Field>
            <Field label={t("onboard.relation")} lang={lang}>
              <input className={inputClass} maxLength={30} placeholder={t("onboard.relationPlaceholder")} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
            </Field>
          </section>
          <section className="space-y-4">
            <h2 lang={lang} className="text-xl font-semibold">
              {t("onboard.parent")}
            </h2>
            <Field label={t("onboard.parentName")} lang={lang}>
              <input className={inputClass} required maxLength={40} value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />
            </Field>
            <div>
              <p lang={lang} className="mb-2 text-[15px] font-semibold">
                {t("onboard.parentLanguage")}
              </p>
              <LanguagePicker value={form.parentLang} onChange={(code) => setForm({ ...form, parentLang: code })} />
            </div>
          </section>
          {error && (
            <p role="alert" className="rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
              {error}
            </p>
          )}
          <Button tone="ink" size="lg" type="submit" className="w-full" disabled={busy || !form.parentLang}>
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
    <AuthLayout>
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
        <h1 lang={lang} className="font-display text-4xl md:text-[44px]">
          {t("invite.title")}
        </h1>
        <div>
          <p lang={lang} className="mb-2 text-[15px] font-semibold">
            {t("lang.choose")}
          </p>
          <LanguagePicker value={myLang} onChange={setMyLang} />
        </div>
        <Field label={t("onboard.yourName")} lang={lang}>
          <input className={inputClass} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("onboard.relation")} lang={lang}>
          <input className={inputClass} maxLength={30} placeholder={t("onboard.relationPlaceholder")} value={relation} onChange={(e) => setRelation(e.target.value)} />
        </Field>
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
