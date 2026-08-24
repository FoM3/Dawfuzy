import { ArrowRight, Check } from "lucide-react";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { SECTION_X } from "@/lib/layout";

const bars = [
  { height: "68%", hot: false },
  { height: "52%", hot: false },
  { height: "85%", hot: false },
  { height: "28%", hot: true }
];

export function FeaturesSection({ openApp }: { openApp: () => void }) {
  return (
    <section id="features" className={`${SECTION_X} bg-brand-50 py-20 md:py-[110px]`}>
      <div className="mb-14 block justify-between gap-10 sm:flex sm:items-end">
        <div>
          <Eyebrow>One simple system</Eyebrow>
          <h2 className="m-0 font-serif text-display-lg leading-none font-medium tracking-[-2px]">
            Know every pack.
            <br />
            <em className="font-medium text-brand-500">Understand every day.</em>
          </h2>
        </div>
        <p className="mt-6 max-w-[390px] text-md2 leading-[1.7] text-subtle sm:mt-0">
          Start with the essentials: water sales, expenses and stock. Add deeper business tools only when Dawfuzy needs them.
        </p>
      </div>

      <div className="grid gap-4.5 md:grid-cols-2">
        <article className="flex min-h-[420px] flex-col gap-10 border-0 bg-brand-700 p-9 pb-11 text-white md:col-span-2 md:grid md:grid-cols-[1fr_0.9fr] md:items-center md:gap-10 lg:gap-[8vw]">
          <div>
            <span className="text-xs2 tracking-[1px] text-[#a9c0b8]">01</span>
            <h3 className="mt-11 mb-3.5 font-serif text-display-md leading-[1.1] font-medium md:mt-[75px]">Fast water sales</h3>
            <p className="m-0 max-w-125 text-md2 leading-[1.65] text-[#c9dad4]">
              Select the brand and size, enter how many packs or bags were sold, and save. The amount and remaining stock update immediately.
            </p>
            <button onClick={openApp} className="mt-6 inline-flex items-center gap-2 border-0 border-b border-current bg-none pb-1 text-md2 text-[#e7ba79]">
              Record a water sale
              <ArrowRight className="size-[15px]" aria-hidden="true" />
            </button>
          </div>

          <div className="rotate-[1.5deg] bg-white p-7.5 text-ink shadow-[0_24px_45px_rgba(8,26,20,.24)] after:-mx-7.5 after:-mb-[35px] after:mt-7.5 after:block after:h-2 after:bg-[linear-gradient(135deg,transparent_5px,white_0)_0_0/10px_10px_repeat-x] after:content-['']">
            <span className="mb-11 flex justify-between text-xs2 tracking-[1.5px] text-subtle">
              SALE <b className="text-[#3f7c56]">SAVED</b>
            </span>
            <div className="flex justify-between">
              <strong>Everpure 500ml</strong>
              <span className="text-sm2 text-subtle">2 packs</span>
            </div>
            <hr className="my-6 border-0 border-t border-dashed border-[#bbb]" />
            <div className="flex justify-between">
              <span className="text-sm2 text-subtle">Total</span>
              <strong className="font-serif text-2xl2">GH₵ 24.00</strong>
            </div>
            <small className="mt-5.5 flex items-center justify-center gap-1.5 text-xs2 text-[#4c7a5e]">
              <Check className="size-3.5" aria-hidden="true" /> Stock updated automatically
            </small>
          </div>
        </article>

        <article className="flex min-h-[390px] flex-col border border-brand-900/10 bg-paper p-9">
          <span className="text-xs2 tracking-[1px] text-[#7d968d]">02</span>
          <div className="flex h-40 items-end gap-3 border-b border-hairline px-3.5 pt-6">
            {bars.map((bar, i) => (
              <i key={i} className={`max-w-15 flex-1 rounded-t-[2px] ${bar.hot ? "bg-brand-500" : "bg-[#bfd0c9]"}`} style={{ height: bar.height }} />
            ))}
          </div>
          <h3 className="mt-auto mb-3.5 font-serif text-display-sm leading-[1.1] font-medium">Stock before it runs out</h3>
          <p className="m-0 max-w-125 text-md2 leading-[1.65] text-subtle">
            See packs and bags on hand, with a clear warning when a product reaches its reorder level.
          </p>
        </article>

        <article className="flex min-h-[390px] flex-col border border-brand-900/10 bg-[#eadbc1] p-9">
          <span className="text-xs2 tracking-[1px] text-[#7d968d]">03</span>
          <div className="my-10 mt-16 flex flex-col font-serif text-[clamp(36px,4vw,49px)]">
            GH₵ 1,284
            <small className="mt-[7px] font-sans text-xs2 tracking-[1.5px] text-[#6e6250] uppercase">This week</small>
          </div>
          <h3 className="mt-auto mb-3.5 font-serif text-display-sm leading-[1.1] font-medium">Daily cash clarity</h3>
          <p className="m-0 max-w-125 text-md2 leading-[1.65] text-subtle">
            Sales, expenses and balance are calculated in Ghana cedis and ready for the owner to review.
          </p>
        </article>
      </div>
    </section>
  );
}
