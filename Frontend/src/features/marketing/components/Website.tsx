import { CtaSection, SiteFooter } from "@/features/marketing/components/CtaSection";
import { FeaturesSection } from "@/features/marketing/components/FeaturesSection";
import { HeroSection } from "@/features/marketing/components/HeroSection";
import { RoadmapSection } from "@/features/marketing/components/RoadmapSection";
import { SiteHeader } from "@/features/marketing/components/SiteHeader";
import { StorySection } from "@/features/marketing/components/StorySection";

export function Website({ openApp }: { openApp: () => void }) {
  // theme-light: the marketing page is art-directed light and opts out of dark mode.
  return (
    <div id="home" className="theme-light min-h-dvh overflow-hidden bg-brand-50 text-[#17221e]">
      <SiteHeader openApp={openApp} />
      <main>
        <HeroSection openApp={openApp} />
        <StorySection />
        <FeaturesSection openApp={openApp} />
        <RoadmapSection />
        <CtaSection openApp={openApp} />
      </main>
      <SiteFooter />
    </div>
  );
}
