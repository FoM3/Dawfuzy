import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { roadmapItems } from "@/features/marketing/data/mock-data";
import { SECTION_X } from "@/lib/layout";
import { cn } from "@/lib/utils";

export function RoadmapSection() {
  return (
    <section id="roadmap" className={`${SECTION_X} bg-brand-200 py-20 md:py-[110px]`}>
      <div className="mb-11">
        <Eyebrow>A careful rollout</Eyebrow>
        <h2 className="m-0 font-serif text-display-lg leading-none font-medium tracking-[-2px]">
          Start useful.
          <br />
          <em className="font-medium text-brand-500">Grow with confidence.</em>
        </h2>
      </div>

      <div className="border-t border-hairline">
        {roadmapItems.map(item => (
          <article
            key={item.index}
            className="grid grid-cols-[65px_1fr_auto] items-center gap-2.5 border-b border-hairline py-8 sm:grid-cols-[120px_1fr_auto] sm:gap-7.5"
          >
            <span className="text-xs2 tracking-[1.5px] text-brand-500 uppercase">{item.when}</span>
            <div>
              <strong className="font-serif text-2xl2">{item.title}</strong>
              <p className="mt-[7px] mb-0 block text-sm2 leading-[1.5] text-subtle sm:ml-7 sm:inline sm:leading-normal">{item.detail}</p>
            </div>
            <b className={cn("font-serif text-[32px] font-medium", item.active ? "text-brand-500" : "text-[#bdb09a]")}>{item.index}</b>
          </article>
        ))}
      </div>
    </section>
  );
}
