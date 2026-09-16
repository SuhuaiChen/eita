import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit, sweepBuckets } from "@/lib/apiGuard";

// Tiny telemetry sink — event names + small metadata only, never content.
// Writes go to Supabase `eita_events` when configured; otherwise the server
// log line is the record (visible in Vercel logs either way).
export async function POST(req: NextRequest) {
  sweepBuckets();
  if (!rateLimit(`tel:${clientKey(req)}`, 120, 3_600_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const body = ((await req.json().catch(() => null)) ?? {}) as {
    ev?: string;
    meta?: Record<string, unknown>;
  };
  const ev = typeof body.ev === "string" ? body.ev.slice(0, 60) : "";
  // closed event-name set — the endpoint is a junk-write relay otherwise
  const ALLOWED = new Set([
    "onboarding.complete",
    "practice.finish",
    "stt.error",
    "dialogue.fallback",
    "gcal.connected",
    "gcal.disconnect",
    "gcal.connect.start",
    "client.error",
    "client.rejection",
  ]);
  if (!ev || !/^[a-z0-9._-]+$/i.test(ev) || !ALLOWED.has(ev)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // bound metadata: keys+values short, no nesting
  const meta: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(body.meta ?? {}).slice(0, 12)) {
    if (typeof v === "string") meta[k.slice(0, 40)] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean") meta[k.slice(0, 40)] = v;
  }
  console.log(`[telemetry] ${ev}`, meta);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    await fetch(`${url}/rest/v1/eita_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ev, meta }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
