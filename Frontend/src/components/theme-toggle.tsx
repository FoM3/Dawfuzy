import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

const icons: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };
const labels: Record<ThemePreference, string> = {
  system: "Theme: following your device",
  light: "Theme: light",
  dark: "Theme: dark"
};

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, cycle } = useTheme();
  const Icon = icons[preference];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${labels[preference]}. Tap to change.`}
      title={labels[preference]}
      className={cn(
        "grid size-10 place-items-center rounded-full border border-line bg-field text-subtle transition-colors hover:border-brandtext hover:text-brandtext",
        className
      )}
    >
      <Icon className="size-4.5" aria-hidden="true" />
    </button>
  );
}
