import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: "autoUpdate",
    // No includeAssets: globPatterns below already covers svg/png, and listing an asset in both
    // produces duplicate precache entries, which makes the whole install throw.
    manifest: {
      name: "Dawfuzy Water Ledger", short_name: "Dawfuzy",
      description: "Water sales, stock and expense records for Dawfuzy.",
      theme_color: "#123e4a", background_color: "#f4f1e9", display: "standalone", start_url: "/?app=ledger",
      icons: [
        { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
      ]
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      navigateFallback: "index.html",
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
    }
  })]
});
