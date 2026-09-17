import { ArrowLeft, House, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useT } from "../i18n";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { cx } from "./ui";

/** Frame for signed-in family screens: a quiet header, one column, room for long translations. */
export function FamilyShell({ lang: viewerLang, title, back, actions, children, wide = false, full = false }: { lang: string; title?: string; back?: string; actions?: ReactNode; children: ReactNode; wide?: boolean; full?: boolean }) {
  const { t, lang } = useT(viewerLang);
  const width = full ? "max-w-7xl" : wide ? "max-w-5xl" : "max-w-3xl";
  return (
    <div className="min-h-dvh bg-paper">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className={cx("mx-auto flex h-16 items-center gap-3 px-4 md:px-6", width)}>
          <Link to="/home" className="flex items-center gap-2" aria-label="DoseCircle">
            <Logo className="size-7" />
            <span className="hidden text-[17px] font-semibold tracking-tight sm:inline">DoseCircle</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            {[
              { to: "/home", icon: House, label: t("home.title") },
              { to: "/settings", icon: Settings, label: t("action.settings") },
            ].map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cx("inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[15px] font-semibold transition-colors", isActive ? "bg-indigo text-white" : "text-ink hover:bg-sunken")}>
                <Icon aria-hidden className="size-4.5" strokeWidth={2.25} />
                <span lang={lang}>{label}</span>
              </NavLink>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className={cx("mx-auto px-4 pb-20 pt-6 md:px-6", width)}>
        {(title || back) && (
          <div className="no-print mb-5 flex flex-wrap items-center gap-3">
            {back && (
              <Link to={back} className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-2 text-[15px] font-semibold text-muted hover:text-ink">
                <ArrowLeft aria-hidden className="size-4.5" strokeWidth={2.25} />
                <span lang={lang}>{t("action.back")}</span>
              </Link>
            )}
            {title && (
              <h1 lang={lang} className="font-display w-full text-4xl md:text-5xl">
                {title}
              </h1>
            )}
            {actions && <div className="flex w-full flex-wrap gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function Field({ label, hint, children, lang }: { label: string; hint?: string; children: ReactNode; lang: string }) {
  return (
    <label className="block">
      <span lang={lang} className="block text-[15px] font-semibold text-ink">
        {label}
      </span>
      {hint && (
        <span lang={lang} className="block text-[14px] text-muted">
          {hint}
        </span>
      )}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export const inputClass = "block min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[17px] text-ink placeholder:text-muted/70 focus:bg-haldi-tint/40 focus:outline-none";
