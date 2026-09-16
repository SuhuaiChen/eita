"use client";

// Optional Supabase Auth — magic-link email (no passwords, the right fit for
// this audience). When Supabase envs are absent the whole surface is dormant:
// authEnabled() → false and every page behaves exactly as the local-only demo.
import { getSupabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

export function authEnabled(): boolean {
  return getSupabase() !== null;
}

export async function sendMagicLink(email: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "unavailable";
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/perfil` : undefined;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return error ? error.message : null;
}

export async function currentSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

export function onAuth(cb: (session: Session | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_ev, s) => cb(s));
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut().catch(() => {});
}

/** the eita_state row key: user id when signed in, device id otherwise */
export function syncKey(uid: string | null, dev: string): string {
  return uid ? `u:${uid}` : `dev:${dev}`;
}
