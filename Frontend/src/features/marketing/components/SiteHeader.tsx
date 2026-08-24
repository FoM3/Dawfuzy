import { useState } from "react";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { navLinks } from "@/features/marketing/data/mock-data";
import { SECTION_X } from "@/lib/layout";

export function SiteHeader({ openApp }: { openApp: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className={`${SECTION_X} relative z-5 flex h-[72px] items-center justify-between border-b border-hairline md:h-[88px]`}>
        <a href="#home">
          <Brand />
        </a>
        <nav className="hidden gap-[35px] text-md2 text-[#52605a] lg:flex">
          {navLinks.map(link => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-brand-900">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            aria-label="Open the Dawfuzy ledger"
            onClick={openApp}
            className="size-11 rounded-full border-brand-900 p-0 text-brand-900 sm:h-11 sm:w-auto sm:gap-2.5 sm:rounded-md sm:px-4 sm:text-sm2"
          >
            <span className="hidden sm:inline">Open ledger</span>
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
          <button
            className="grid size-11 place-items-center rounded-full border border-hairline text-brand-900 lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen(open => !open)}
          >
            {menuOpen ? <X className="size-[22px]" aria-hidden="true" /> : <Menu className="size-[22px]" aria-hidden="true" />}
          </button>
        </div>
      </header>

      <nav id="mobile-nav" hidden={!menuOpen} className={`${SECTION_X} sticky top-0 z-6 grid border-b border-hairline bg-brand-50 lg:hidden`}>
        {navLinks.map(link => (
          <a
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-between border-b border-hairline py-[18px] text-lg2 last:border-b-0"
          >
            {link.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        ))}
      </nav>
    </>
  );
}
