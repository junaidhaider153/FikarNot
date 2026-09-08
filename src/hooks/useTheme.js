import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "fikarnot-theme";

function getInitialTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable (private mode / disabled) — fall through to system preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Applies the theme to <html data-theme="..."> as early as possible (from
// App's top-level render, before the boot screen even resolves) so the whole
// app — including third-party-styled bits — can key off one attribute. Not
// wired into an inline <head> script because this app's CSP has no
// 'unsafe-inline' for script-src, so there's a brief flash on first load
// for returning dark-mode users; acceptable trade-off rather than loosening
// the CSP for a cosmetic fix.
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore write failures — the in-memory state still drives the UI for this session.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
