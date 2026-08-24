import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;

// Supabase replaced the anon/service_role JWTs with publishable/secret keys. The
// publishable key (sb_publishable_…) is the browser-safe one; the legacy anon key
// still works, so accept either. A secret key must never appear here.
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

if (publishableKey?.startsWith("sb_secret_")) {
  throw new Error("A Supabase secret key must never be used in the browser. Use the publishable key.");
}

/** With no credentials the app runs exactly as before: local-only, fully offline. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, publishableKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// Sign-up would replace the admin's own session, so provisioning runs on a second
// client with its own storage key and no session persistence.
export function provisioningClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "dawfuzy-provisioning" }
  });
}

// Staff sign in by name, so map each name onto a stable synthetic address.
export const emailForName = (name: string) =>
  `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person"}@dawfuzy.local`;

// Supabase enforces a 6-character minimum; the PIN is the only secret part.
export const passwordForPin = (pin: string) => `${pin}-dawfuzy`;
