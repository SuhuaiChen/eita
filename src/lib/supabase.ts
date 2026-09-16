// Optional Supabase persistence. The app runs fully on localStorage for the
// demo; when NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set,
// learner-state snapshots are also upserted to the `eita_state` table
// (see supabase/schema.sql).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    // createClient throws on a malformed URL — a bad env must degrade to
    // local-only, not crash the whole app
    client = url && key ? createClient(url, key) : null;
  } catch {
    client = null;
  }
  return client;
}

export function deviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem("eita:device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("eita:device", id);
    }
    return id;
  } catch {
    return "ephemeral";
  }
}
