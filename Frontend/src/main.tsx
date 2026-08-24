import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
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

// Earlier versions cached the ledger on the device, staff PINs included. Nothing is
// stored now, so clear what those versions left behind rather than let it sit there.
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("dawfuzy-")) localStorage.removeItem(key);
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
