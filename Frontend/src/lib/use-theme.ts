import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

/**
 * The one thing that is stored. It is a display preference, not shop data: no ledger, no
 * cost, no PIN. An installed app that forgot you had chosen dark on every launch would be
 * broken, and index.html reads the same key before first paint to avoid a flash.
 */
export const THEME_KEY = "dawfuzy-theme";

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolve(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Also keeps the address-bar colour in step, which is visible in installed/standalone mode.
function apply(preference: ThemePreference) {
  const resolved = resolve(preference);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0f1518" : "#123e4a");
  return resolved;
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<"light" | "dark">(() => apply(preference));

  useEffect(() => {
    setResolved(apply(preference));
    try {
      localStorage.setItem(THEME_KEY, preference);
    } catch {
      // Storage blocked; the choice still holds for this visit.
    }
  }, [preference]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(apply("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference(current => (current === "system" ? "light" : current === "light" ? "dark" : "system"));
  }, []);

  return { preference, resolved, setPreference, cycle };
}
