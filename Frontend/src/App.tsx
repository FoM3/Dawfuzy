import { useEffect, useState } from "react";
import { Ledger } from "@/features/ledger/components/Ledger";
import { Website } from "@/features/marketing/components/Website";
import type { LedgerScreen } from "@/features/ledger/types";

const ledgerScreens: LedgerScreen[] = ["overview", "entry", "history", "products", "team", "audit", "account"];

type Route = { inApp: boolean; screen: LedgerScreen };

// The URL is the source of truth, so a refresh or a shared link lands on the same screen.
function readRoute(): Route {
  const params = new URLSearchParams(location.search);
  const raw = params.get("screen") as LedgerScreen | null;
  return {
    inApp: params.get("app") === "ledger",
    screen: raw && ledgerScreens.includes(raw) ? raw : "overview"
  };
}

function urlFor(route: Route) {
  return route.inApp ? `${location.pathname}?app=ledger&screen=${route.screen}` : location.pathname;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    // Normalise on first load so "?app=ledger" alone gains its screen param.
    history.replaceState(null, "", urlFor(readRoute()));
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function go(next: Route) {
    history.pushState(null, "", urlFor(next));
    setRoute(next);
    window.scrollTo(0, 0);
  }

  const openApp = () => go({ inApp: true, screen: "overview" });
  const setScreen = (screen: LedgerScreen) => go({ inApp: true, screen });

  return route.inApp ? (
    <Ledger screen={route.screen} setScreen={setScreen} />
  ) : (
    <Website openApp={openApp} />
  );
}
