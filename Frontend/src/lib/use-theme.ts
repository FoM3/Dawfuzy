import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

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
  // Not stored: every load starts on the OS preference, and the toggle lasts the visit.
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">(() => apply(preference));

  useEffect(() => {
    setResolved(apply(preference));
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
