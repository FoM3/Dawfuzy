import axios, { type AxiosInstance } from "axios";
import { supabase } from "@/lib/supabase";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/**
 * PostgREST is a plain REST API, so the reads go through axios while supabase-js keeps
 * ownership of the session. That split buys one place to attach the token, one timeout,
 * and one error shape, without reimplementing token refresh.
 */
export const api: AxiosInstance | null =
  url && key
    ? axios.create({
        baseURL: `${url}/rest/v1`,
        // A shop counter on a weak connection should fail and say so rather than hang.
        timeout: 15_000,
        headers: { apikey: key, "Content-Type": "application/json" }
      })
    : null;

// The access token is read per request rather than set once: it is rotated by supabase-js
// on refresh, and a stale Authorization header reads as an anonymous caller to RLS.
api?.interceptors.request.use(async config => {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  config.headers.Authorization = `Bearer ${token ?? key}`;
  return config;
});

/** PostgREST puts its messages in the body; surface that rather than "Request failed". */
export function explainApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") return "The connection timed out. Try again.";
    const body = error.response?.data as { code?: string; message?: string; hint?: string } | undefined;
    // A missing function means the database is behind the app, not that the user did
    // anything wrong. Say which file fixes it.
    if (body?.code === "PGRST202" || /could not find the function/i.test(body?.message ?? "")) {
      return "This needs the latest supabase/setup.sql. Run it in the SQL editor, then try again.";
    }
    return body?.message ?? body?.hint ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export type Page<T> = { rows: T[]; total: number };

/**
 * One page of a table or view, with the total row count.
 *
 * count=exact makes PostgREST return "0-19/482" in Content-Range, which is what lets the
 * pager show a last page without a second query.
 */
export async function fetchPage<T>(
  path: string,
  params: Record<string, string>,
  page: number,
  pageSize: number
): Promise<Page<T>> {
  if (!api) return { rows: [], total: 0 };
  const first = page * pageSize;
  const response = await api.get<T[]>(path, {
    params,
    headers: { Prefer: "count=exact", Range: `${first}-${first + pageSize - 1}` }
  });
  const range = String(response.headers["content-range"] ?? "");
  const total = Number(range.split("/")[1]);
  return { rows: response.data ?? [], total: Number.isFinite(total) ? total : response.data.length };
}

/** Calls a Postgres function. The aggregates all live behind these. */
export async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!api) return [] as unknown as T;
  const { data } = await api.post<T>(`/rpc/${name}`, args);
  return data;
}
