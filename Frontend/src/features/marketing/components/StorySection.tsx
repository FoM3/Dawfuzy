import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { journeySteps } from "@/features/marketing/data/mock-data";
import { SECTION_X, SECTION_Y } from "@/lib/layout";

export function StorySection() {
  return (
    <section id="story" className={`${SECTION_X} ${SECTION_Y} grid gap-10 bg-brand-900 text-white lg:grid-cols-2 lg:gap-x-[8vw]`}>
      <div>
        <Eyebrow light>Why Dawfuzy</Eyebrow>
        <h2 className="m-0 font-serif text-display-lg leading-none font-medium tracking-[-2px]">
          The notebook built the business.
          <br />
          <em className="font-medium text-[#e5b066]">Now we build on it.</em>
        </h2>
      </div>

      <div className="max-w-130 font-serif text-lg2 leading-[1.6] text-[#becfc8] lg:pt-8.5">
        <p className="m-0 mb-4.5">
          Every handwritten line tells the story of a sale. But when water moves quickly, paper makes it difficult to know what remains, what sold and what cash should be available.
        </p>
        <p className="m-0">Dawfuzy keeps the familiar simplicity of a ledger while adding instant totals, stock alerts and a dependable history.</p>
      </div>

      <div className="mt-7.5 grid gap-7.5 border-t border-white/15 pt-9 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:gap-0 sm:pt-13 lg:col-span-2">
        {journeySteps.map(({ step, title, detail, Icon }, index) => (
          <Fragment key={step}>
            {index > 0 && (
              <div className="relative mx-auto -my-1.25 h-8.75 w-px self-center bg-[#59766c] sm:mx-0 sm:my-0 sm:h-px sm:w-[8vw]">
                <ArrowRight className="absolute -right-2 top-2.5 size-4 rotate-90 text-[#aec0b9] sm:-right-0.5 sm:-top-2 sm:rotate-0" aria-hidden="true" />
              </div>
            )}
            <article className="relative text-center sm:px-[3vw]">
              <span className="absolute left-0 top-1 text-xs2 text-[#8aa79d] sm:left-[1vw]">{step}</span>
              <div className="mx-auto mb-5.5 grid size-16.5 place-items-center rounded-full border border-[#78948a] text-[#e4b470]">
                <Icon className="size-6.5" aria-hidden="true" />
              </div>
              <h3 className="m-0 mb-2 font-serif text-2xl2 font-medium">{title}</h3>
              <p className="m-0 text-sm2 text-[#a9beb6]">{detail}</p>
            </article>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
