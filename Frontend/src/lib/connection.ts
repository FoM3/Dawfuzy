import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type Connection =
  | { state: "local" }        // no credentials: local-only by design
  | { state: "checking" }
  | { state: "connected" }
  | { state: "no-schema" }    // project reachable, tables not created yet
  | { state: "unreachable"; detail: string };

/**
 * One cheap round-trip that distinguishes the three failure modes people actually hit:
 * wrong credentials, project fine but schema never run, and no network.
 */
export async function probeConnection(): Promise<Connection> {
  if (!isSupabaseConfigured || !supabase) return { state: "local" };
  if (!navigator.onLine) return { state: "unreachable", detail: "This device is offline" };

  // people, not profiles: this runs on the sign-in screen with no session, and anon is
  // deliberately revoked from every base table. Probing one would report a healthy
  // project as unreachable.
  const { error } = await supabase.from("people").select("id").limit(1);
  if (!error) return { state: "connected" };

  // Permission denied still means the project answered, so it is reachable.
  if (error.code === "42501") return { state: "connected" };

  // PostgREST answers a missing table with PGRST205 ("schema cache") rather than the
  // Postgres 42P01 you would expect, so match both.
  const missingTable =
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|could not find the table|does not exist/i.test(error.message);
  if (missingTable) return { state: "no-schema" };
  if (/JWT|api key|Invalid/i.test(error.message)) return { state: "unreachable", detail: "Key rejected" };
  return { state: "unreachable", detail: error.message.slice(0, 80) };
}
