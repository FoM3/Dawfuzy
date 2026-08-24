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

/**
 * The same state as an icon, shaped like the theme toggle so the header reads as one row
 * of controls. The colour still carries the meaning; the label moves to the tooltip.
 */
export function SyncIcon({ sync, className }: { sync: SyncState; className?: string }) {
  const { label, Icon, tone } = copy[sync];
  return (
    <span
      role="status"
      aria-label={`Sync: ${label}`}
      title={label}
      className={cn("grid size-10 place-items-center rounded-full border border-line bg-field", tone, className)}
    >
      <Icon className={cn("size-4.5", sync === "pending" && "animate-spin")} aria-hidden="true" />
    </span>
  );
}
