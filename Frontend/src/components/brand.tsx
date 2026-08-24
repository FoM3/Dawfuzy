import { cn } from "@/lib/utils";

export function Brand({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[11px] text-xl2 font-bold tracking-[-0.5px]", light && "text-white", className)}>
      <span
        className={cn(
          "grid size-[35px] place-items-center rounded-full font-serif text-xl2 italic",
          light ? "bg-brand-50 text-brand-900" : "bg-deep text-brand-50"
        )}
      >
        D
      </span>
      <span>Dawfuzy</span>
    </span>
  );
}
