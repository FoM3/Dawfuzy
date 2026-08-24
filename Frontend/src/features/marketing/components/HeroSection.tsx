import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { trustPoints } from "@/features/marketing/data/mock-data";
import { SECTION_X } from "@/lib/layout";

export function HeroSection({ openApp }: { openApp: () => void }) {
  return (
    <section className={`${SECTION_X} grid items-center gap-[50px] py-14 lg:min-h-[calc(100dvh-88px)] lg:grid-cols-[0.92fr_1.08fr] lg:gap-[clamp(32px,5vw,80px)] lg:py-16`}>
      <div className="relative z-2 max-w-[650px]">
        <Eyebrow>Water for every day. Records for every sale.</Eyebrow>
        <h1 className="m-0 font-serif text-display-xl leading-none font-medium tracking-[-1.5px] md:tracking-[-2px]">
          Your water business,
          <br />
          <em className="font-medium text-brand-500">flowing better.</em>
        </h1>
        <p className="my-[30px] max-w-[570px] font-serif text-[clamp(18px,1.5vw,22px)] leading-[1.55] text-[#46534e]">
          Dawfuzy brings every pack, bag, sale and expense out of the notebook and into one clear place, made for a growing Ghanaian family business.
        </p>
        <div className="flex flex-col items-stretch gap-[18px] sm:flex-row sm:items-center sm:gap-8">
          <Button onClick={openApp} className="h-12 gap-2.5 px-5 text-md2 font-semibold">
            Try the water ledger
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          </Button>
          <a href="#story" className="inline-flex items-center gap-2 self-start border-b border-brand-900 pb-1 text-md2 font-semibold">
            See how it works
            <ArrowDown className="size-[15px]" aria-hidden="true" />
          </a>
        </div>
        <div className="mt-10 flex max-w-[560px] flex-col gap-6 border-t border-hairline pt-6 min-[391px]:flex-row md:mt-[54px] md:gap-[50px]">
          {trustPoints.map(point => (
            <div key={point.title} className="flex flex-col gap-[5px]">
              <strong className="text-sm2">{point.title}</strong>
              <span className="text-xs2 text-subtle">{point.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative -mr-[18px] min-h-[390px] self-stretch after:absolute after:inset-[25%_-30%_-20%_20%] after:-z-10 after:rounded-full after:bg-[#d9c9ad] after:opacity-25 after:blur-[90px] after:content-[''] sm:mr-0 md:min-h-[480px] lg:min-h-[560px]">
        <img
          src="/assets/dawfuzy-water-hero.png"
          alt="Packs of bottled and sachet water beside a tablet"
          className="size-full rounded-tl-[110px] object-cover object-[55%_center] shadow-[0_25px_80px_rgba(40,45,35,.15)] md:rounded-tl-[180px]"
        />
        <div className="absolute bottom-5 left-4 grid min-w-[235px] grid-cols-[auto_1fr_auto] items-center gap-[13px] rounded-[3px] bg-white/95 p-[17px_19px] shadow-[0_14px_45px_rgba(27,49,40,.16)] backdrop-blur-[10px] lg:-left-[35px] lg:bottom-[38px] lg:min-w-[260px]">
          <span className="size-2.5 rounded-full bg-[#4e9a6c] shadow-[0_0_0_6px_#e1f0e6]" />
          <div className="flex flex-col gap-[3px]">
            <small className="text-xs2 tracking-[1px] text-subtle uppercase">Stock status</small>
            <strong className="text-sm2">5 products ready to sell</strong>
          </div>
          <Check className="size-[18px] text-[#43865e]" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
