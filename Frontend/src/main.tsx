import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { THEME_KEY } from "@/lib/use-theme";
import { FAILURE_KEY, PENDING_KEY } from "@/lib/sync";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Figures are read repeatedly as someone flips between ranges; a short window
      // keeps that instant without ever showing yesterday's totals.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

// Earlier versions cached the whole ledger here, staff PINs included. Clear what they left
// behind. Three keys survive on purpose: the theme, which says nothing about the shop, and
// unsent sales with the record of why they are stuck, which exist nowhere else until they
// reach the server.
const keep = [THEME_KEY, PENDING_KEY, FAILURE_KEY];
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("dawfuzy-") && !keep.includes(key)) localStorage.removeItem(key);
  }
} catch {
  // Storage disabled or blocked; there is nothing to clean up either way.
}

registerSW({ immediate: true });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
