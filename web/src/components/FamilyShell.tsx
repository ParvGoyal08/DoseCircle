import { Activity, ArrowLeft, ChartLine, House, Pill, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useT } from "../i18n";
import { useFamily } from "../lib/family";
import { currentPerson, rememberPerson } from "../lib/person";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { cx } from "./ui";

/**
 * Frame for signed-in family screens: a sidebar on a desktop and a tab bar on a phone, both reaching
 * the same six places, with the page on a cream background under a quiet top bar.
 *
 * Medicines, daily checks and "how it is going" belong to one person, so those links go to whoever
 * was chosen last (on the home switcher, or by opening one of their pages). Until someone is chosen
 * they lead home, where the choosing happens.
 */
export function FamilyShell({ lang: viewerLang, title, subtitle, back, actions, children, wide = false, full = false }: { lang: string; title?: string; subtitle?: string; back?: string; actions?: ReactNode; children: ReactNode; wide?: boolean; full?: boolean }) {
  const { t, lang } = useT(viewerLang);
  const { pid: routePid } = useParams();
  const { state } = useFamily();
  if (routePid) rememberPerson(routePid);
  const pid = routePid ?? currentPerson();
  const person = (path: string) => (pid ? `/parents/${pid}/${path}` : "/home");
  const width = full ? "max-w-6xl" : wide ? "max-w-5xl" : "max-w-3xl";
  const me = state.status === "ready" ? state.me : null;

  const items = [
    { to: "/home", icon: House, label: t("nav.home"), short: t("nav.home") },
    { to: person("medicines"), icon: Pill, label: t("action.medicines"), short: t("action.medicines"), match: "/medicines" },
    { to: person("checks"), icon: Activity, label: t("action.checks"), short: t("nav.checks"), match: "/checks" },
    { to: person("insights"), icon: ChartLine, label: t("action.insights"), short: null, match: "/insights" },
    { to: "/people", icon: Users, label: t("action.people"), short: t("nav.family") },
    { to: "/settings", icon: Settings, label: t("action.settings"), short: t("action.settings") },
  ];
  const { pathname } = useLocation();
  const active = (item: (typeof items)[number]) => (item.match ? pathname.endsWith(item.match) : pathname === item.to);

  return (
    <div className="min-h-dvh bg-paper">
      {/* Desktop sidebar. */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-paper))] px-4 py-7 lg:flex">
        <Link to="/home" className="mb-10 flex items-center gap-2.5 px-3" aria-label="DoseCircle">
          <Logo className="size-8 rounded-[9px]" />
          <span className="font-display text-[25px] text-indigo-deep dark:text-ink">DoseCircle</span>
        </Link>
        <nav className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              aria-current={active(item) ? "page" : undefined}
              className={cx("flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition-colors", active(item) ? "bg-indigo-tint text-indigo-deep dark:text-ink" : "text-muted hover:bg-indigo-tint/60 hover:text-ink")}
            >
              <item.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={2} />
              <span lang={lang}>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-indigo-tint p-5">
          <p lang={lang} className="font-display text-[19px] leading-snug text-indigo-deep dark:text-ink">
            {t("shell.tagline")}
          </p>
          <p lang={lang} className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {t("shell.taglineHelp")}
          </p>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        {/* Top bar: the wordmark on a phone, and on every size the theme switch and who is signed in. */}
        <header className="no-print sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 md:px-8">
            <Link to="/home" className="flex items-center gap-2 lg:hidden" aria-label="DoseCircle">
              <Logo className="size-7 rounded-[8px]" />
              <span className="font-display text-[21px] text-indigo-deep dark:text-ink">DoseCircle</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              {me && (
                <Link to="/settings" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-sunken">
                  <span aria-hidden className="grid size-8 place-items-center rounded-full bg-indigo text-[14px] font-semibold text-white">
                    {[...me.displayName][0]?.toUpperCase()}
                  </span>
                  <span className="hidden text-[14.5px] font-medium sm:inline">{me.displayName}</span>
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className={cx("mx-auto px-4 pb-28 pt-7 md:px-8 lg:pb-16", width)}>
          {(title || back) && (
            <div className="no-print mb-7">
              {back && (
                <Link to={back} className="-ml-1 mb-2 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-2 text-[14.5px] font-medium text-muted hover:text-ink">
                  <ArrowLeft aria-hidden className="size-4" strokeWidth={2.25} />
                  <span lang={lang}>{t("action.back")}</span>
                </Link>
              )}
              {title && (
                <h1 lang={lang} className="font-display text-[34px] md:text-[40px]">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p lang={lang} className="mt-1.5 text-[15px] text-muted">
                  {subtitle}
                </p>
              )}
              {actions && <div className="mt-5 flex w-full flex-wrap gap-2">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Phone tab bar: the five places people go most; "how it is going" is on the home screen. */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pt-1.5 backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {items
            .filter((item) => item.short)
            .map((item) => (
              <li key={item.label}>
                <Link to={item.to} aria-current={active(item) ? "page" : undefined} className={cx("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11.5px] font-medium", active(item) ? "text-indigo-deep dark:text-ink" : "text-muted")}>
                  <span className={cx("grid h-7 w-12 place-items-center rounded-full transition-colors", active(item) && "bg-indigo-tint")}>
                    <item.icon aria-hidden className="size-[19px]" strokeWidth={2} />
                  </span>
                  <span lang={lang} className="max-w-full truncate px-0.5">
                    {item.short}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </nav>
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
