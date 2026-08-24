import { ClipboardList, Package, TrendingUp } from "lucide-react";
import type { JourneyStep, NavLink, RoadmapItem, TrustPoint } from "@/features/marketing/types";

export const navLinks: NavLink[] = [
  { href: "#story", label: "Our story" },
  { href: "#features", label: "What it does" },
  { href: "#roadmap", label: "Roadmap" }
];

export const trustPoints: TrustPoint[] = [
  { title: "Works offline", detail: "Keep selling with weak internet" },
  { title: "Built for mobile", detail: "Record sales at the shop" }
];

export const journeySteps: JourneyStep[] = [
  { step: "01", title: "Record", detail: "Choose the water, quantity and save.", Icon: ClipboardList },
  { step: "02", title: "Track", detail: "Stock reduces with every sale.", Icon: Package },
  { step: "03", title: "Grow", detail: "See what sells and reorder early.", Icon: TrendingUp }
];

export const roadmapItems: RoadmapItem[] = [
  { when: "Now", title: "Foundation", detail: "Water catalogue, sales, expenses, stock, daily totals and installable offline PWA.", index: "01", active: true },
  { when: "Next", title: "Operations", detail: "Secure family accounts, cloud backup, supplier purchases, exports and receipt sharing.", index: "02" },
  { when: "Later", title: "Business insight", detail: "Profit reports, customer credit, delivery routes and multiple selling points.", index: "03" }
];
