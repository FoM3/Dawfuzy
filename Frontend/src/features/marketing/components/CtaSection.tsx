import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { SECTION_X, SECTION_Y } from "@/lib/layout";

export function CtaSection({ openApp }: { openApp: () => void }) {
  return (
    <section className={`${SECTION_X} ${SECTION_Y} bg-brand-900 text-center text-white`}>
      <Eyebrow light className="justify-center">
        The next chapter
      </Eyebrow>
      <h2 className="m-0 font-serif text-display-lg leading-none font-medium tracking-[-2px]">
        Keep water moving.
        <br />
        <em className="font-medium text-[#e6b16a]">Leave paperwork behind.</em>
      </h2>
      <p className="my-6 text-md2 text-[#b6c9c1]">Open the working prototype and record a water transaction.</p>
      <Button onClick={openApp} className="mt-2.5 h-12 gap-2.5 bg-brand-50 px-5 text-md2 font-semibold text-brand-900 hover:bg-white">
        Open Dawfuzy Ledger
        <ArrowRight className="size-[18px]" aria-hidden="true" />
      </Button>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className={`${SECTION_X} flex min-h-[105px] flex-col items-center justify-between gap-3.5 bg-brand-950 py-7.5 text-center text-xs2 text-[#b3c3bc] sm:flex-row sm:gap-4 sm:py-0 sm:text-left`}>
      <Brand light />
      <p className="m-0">Family owned. Proudly Ghanaian.</p>
      <span>© {new Date().getFullYear()} Dawfuzy</span>
    </footer>
  );
}
