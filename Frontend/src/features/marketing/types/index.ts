import type { LucideIcon } from "lucide-react";

export type NavLink = { href: string; label: string };
export type TrustPoint = { title: string; detail: string };
export type JourneyStep = { step: string; title: string; detail: string; Icon: LucideIcon };
export type RoadmapItem = { when: string; title: string; detail: string; index: string; active?: boolean };
