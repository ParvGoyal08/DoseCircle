import { ArrowLeft, House, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useT } from "../i18n";
import { Logo } from "./Logo";
import { cx } from "./ui";

/** Frame for signed-in family screens: a quiet header, one column, room for long translations. */
export function FamilyShell({ lang: viewerLang, title, back, actions, children, wide = false }: { lang: string; title?: string; back?: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t, lang } = useT(viewerLang);
  return (
    <div className="min-h-dvh bg-paper">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-sm">
        <div className={cx("mx-auto flex h-14 items-center gap-3 px-4", wide ? "max-w-5xl" : "max-w-3xl")}>
          <Link to="/home" className="flex items-center gap-2" aria-label="DoseCircle">
            <Logo className="size-7" />
            <span className="hidden text-[17px] font-semibold sm:inline">DoseCircle</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            {[
              { to: "/home", icon: House, label: t("home.title") },
              { to: "/settings", icon: Settings, label: t("action.settings") },
            ].map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cx("inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold", isActive ? "bg-ink text-paper" : "text-ink hover:bg-surface")}>
                <Icon aria-hidden className="size-4.5" strokeWidth={2.25} />
                <span lang={lang}>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className={cx("mx-auto px-4 pb-16 pt-5", wide ? "max-w-5xl" : "max-w-3xl")}>
        {(title || back) && (
          <div className="no-print mb-5 flex flex-wrap items-center gap-3">
            {back && (
              <Link to={back} className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-2 text-[15px] font-semibold text-muted hover:text-ink">
                <ArrowLeft aria-hidden className="size-4.5" strokeWidth={2.25} />
                <span lang={lang}>{t("action.back")}</span>
              </Link>
            )}
            {title && (
              <h1 lang={lang} className="w-full text-[30px] font-semibold leading-tight tracking-tight">
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

export const inputClass = "block min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 text-[17px] text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";
