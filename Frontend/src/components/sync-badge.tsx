import { CloudOff, RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncState } from "@/lib/sync";

const copy: Record<SyncState, { label: string; Icon: typeof Wifi; tone: string }> = {
  local: { label: "Ready offline", Icon: Wifi, tone: "text-pos" },
  synced: { label: "Synced", Icon: Wifi, tone: "text-pos" },
  pending: { label: "Syncing", Icon: RefreshCw, tone: "text-accent" },
  offline: { label: "Offline", Icon: CloudOff, tone: "text-subtle" },
  error: { label: "Sync failed", Icon: TriangleAlert, tone: "text-neg" }
};

// The same state as an icon, shaped like the theme toggle so the header reads as one row of
// controls. The colour still carries the meaning; the label moves to the tooltip.
export function SyncIcon({
  sync, reason, retry, className
}: { sync: SyncState; reason?: string | null; retry?: () => void; className?: string }) {
  const { label, Icon, tone } = copy[sync];
  // The reason is on the badge itself: a swallowed sync failure is impossible to explain
  // to whoever is standing at the counter watching it spin.
  const detail = reason ? `${label}: ${reason}` : label;
  return (
    <button
      type="button"
      onClick={retry}
      aria-label={`Sync: ${detail}. Tap to try again.`}
      title={`${detail}${retry ? " (tap to try again)" : ""}`}
      className={cn(
        "grid size-10 place-items-center rounded-full border border-line bg-field transition-colors hover:border-brandtext",
        tone,
        className
      )}
    >
      <Icon className={cn("size-4.5", sync === "pending" && "animate-spin")} aria-hidden="true" />
    </button>
  );
}
