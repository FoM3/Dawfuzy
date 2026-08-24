import { cn } from "@/lib/utils";

export function Eyebrow({ children, light = false, className }: { children: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <p className={cn("m-0 mb-[22px] flex items-center gap-[11px] text-xs2 font-bold tracking-[2px] uppercase", light ? "text-[#cbdad4]" : "text-brandtext", className)}>
      <span className="h-px w-7 shrink-0 bg-accent" />
      {children}
    </p>
  );
}
