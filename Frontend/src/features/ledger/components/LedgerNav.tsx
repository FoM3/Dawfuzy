import { ChartColumn, CircleUser, Package, Plus, Table2, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import type { LedgerScreen, Role } from "@/features/ledger/types";
import { isAdminRole, userScreens } from "@/features/ledger/types";
import { cn } from "@/lib/utils";

// Water stock is parked: InventoryScreen.tsx stays in the repo but is not wired to a tab.
const items: { screen: LedgerScreen; label: string; short: string; Icon: typeof ChartColumn }[] = [
  { screen: "overview", label: "Analytics", short: "Stats", Icon: ChartColumn },
  { screen: "entry", label: "New sale", short: "New sale", Icon: Plus },
  { screen: "history", label: "Sales history", short: "History", Icon: Table2 },
  { screen: "products", label: "Products", short: "Products", Icon: Package },
  { screen: "team", label: "Team", short: "Team", Icon: Users },
  // Signing out and the audit trail both live on the account page rather than the bar.
  { screen: "account", label: "Account", short: "Account", Icon: CircleUser }
];

const visibleTo = (role: Role) => (isAdminRole(role) ? items : items.filter(i => userScreens.includes(i.screen)));

// Sync state lives in the header now, and signing out on the account screen.
type NavProps = {
  screen: LedgerScreen;
  setScreen: (screen: LedgerScreen) => void;
  role: Role;
};

export function LedgerSidebar({ screen, setScreen, role }: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh min-h-dvh flex-col bg-deep px-5.5 py-7.5 text-white lg:flex">
      <Brand light />
      <nav className="mt-16 grid gap-1.75">
        {visibleTo(role).map(({ screen: target, label, Icon }) => (
          <button
            key={target}
            onClick={() => setScreen(target)}
            className={cn(
              "flex w-full items-center gap-3 rounded border-0 bg-transparent px-3.5 py-3 text-left text-md2 transition-colors",
              screen === target ? "bg-field/10 text-white" : "text-on-deep-subtle hover:bg-field/10 hover:text-white"
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function LedgerMobileNav({ screen, setScreen, role }: NavProps) {
  const shown = visibleTo(role);
  return (
    <nav
      data-app-nav
      style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
      className="fixed inset-x-0 bottom-0 z-9 grid h-[calc(var(--nav-height)+var(--safe-bottom))] border-t border-line bg-panel/95 pb-(--safe-bottom) backdrop-blur-md lg:hidden"
    >
      {shown.map(({ screen: target, short, Icon }) => (
        <button
          key={target}
          onClick={() => setScreen(target)}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-1 border-0 bg-transparent px-0.5",
            screen === target ? "text-brandtext" : "text-subtle"
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          <span className="max-w-full truncate text-xs2 leading-none">{short}</span>
        </button>
      ))}
    </nav>
  );
}
