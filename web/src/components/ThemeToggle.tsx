import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "dosecircle.theme";

export function initialTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable: fall back to light, which reads best for most people in daylight.
  }
  return "light";
}

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
}

/** Light by default; dark is one tap away for people who find it easier (for example with cataracts). */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Ignore: the choice lasts for this visit.
    }
  }, [theme]);
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? "Switch to dark theme" : "Switch to light theme"}
      className={className ?? "grid size-11 place-items-center rounded-full text-ink hover:bg-sunken"}
    >
      {theme === "light" ? <Moon aria-hidden className="size-5" /> : <Sun aria-hidden className="size-5" />}
    </button>
  );
}
