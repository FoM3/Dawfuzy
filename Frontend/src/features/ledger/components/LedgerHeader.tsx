import { ShieldCheck, User } from "lucide-react";
import { SyncIcon } from "@/components/sync-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAdminRole, type Account, type LedgerScreen } from "@/features/ledger/types";
import type { SyncState } from "@/lib/sync";


const titles: Record<LedgerScreen, string> = {
  overview: "Analytics",
  entry: "New sale",
  history: "Sales history",
  products: "Products",
  team: "Team",
  audit: "Audit log",
  account: "Account"
};

type HeaderProps = { screen: LedgerScreen; account: Account; sync: SyncState; editAccount: () => void };

export function LedgerHeader({ screen, account, sync, editAccount }: HeaderProps) {
  const isAdmin = isAdminRole(account.role);
  return (
    <header className="sticky top-0 z-4 flex h-18.75 items-center justify-between gap-3 border-b border-line bg-header-bg/85 px-[clamp(16px,4vw,55px)] backdrop-blur-md sm:gap-4 md:h-22.5">
      {/* min-w-0 so the title truncates instead of wrapping the brand onto two lines and
          forcing the header taller than it is. */}
      <div className="min-w-0 flex-1">
        <p className="m-0 mb-1 truncate text-[10px] font-bold tracking-[1.2px] text-subtle sm:mb-1.25 sm:text-xs2 sm:tracking-[1.4px]">
          DAWFUZY WATER LEDGER
        </p>
        <h2 className="m-0 truncate font-serif text-display-sm font-medium tracking-[-.5px]">{titles[screen]}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <SyncIcon sync={sync} className="size-9 sm:size-10" />
        <ThemeToggle className="size-9 sm:size-10" />
        <button
          type="button"
          onClick={editAccount}
          aria-label={`Edit your details, signed in as ${account.name}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-field p-1 text-left transition-colors hover:border-brandtext sm:p-1.5 sm:pr-3.5"
        >
          <span className={`grid size-7 place-items-center rounded-full ${isAdmin ? "bg-pos-soft text-pos" : "bg-info-soft text-info"}`}>
            {isAdmin ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <User className="size-3.5" aria-hidden="true" />}
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <strong className="text-sm2">{account.name}</strong>
            <small className="text-xs2 text-subtle capitalize">{account.role}</small>
          </span>
        </button>
      </div>
    </header>
  );
}
