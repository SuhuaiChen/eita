import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit, sweepBuckets } from "@/lib/apiGuard";

// Google Calendar token broker.
// POST {code, redirect_uri}  → exchange the auth code, stash the refresh token
//                              in an httpOnly cookie, return an access token.
// POST {}                    → refresh via the cookie, return an access token.
// DELETE                     → revoke + clear the cookie.
// Requires GOOGLE_CLIENT_SECRET server-side; without it the client stays on
// the legacy implicit flow.

const RT_COOKIE = "eita_gcal_rt";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/gcal",
    maxAge: 60 * 60 * 24 * 180, // 6 months — Google may rotate earlier
  };
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  } | null;
  return { ok: res.ok, data };
}

export async function POST(req: NextRequest) {
  const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!cid || !secret)
    return NextResponse.json({ error: "code flow not configured" }, { status: 503 });

  sweepBuckets();
  if (!rateLimit(`gcal:${clientKey(req)}`, 30, 3_600_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    code?: string;
    redirect_uri?: string;
  };

  if (body.code) {
    // real auth codes are ~≤300 chars; reject anything that isn't a plain string
    if (typeof body.code !== "string" || body.code.length > 2048)
      return NextResponse.json({ error: "bad code" }, { status: 400 });
    // the redirect_uri must equal the one used to get the code; Google enforces
    // this, but constrain to our own path anyway
    if (
      typeof body.redirect_uri !== "string" ||
      body.redirect_uri.length > 200 ||
      !body.redirect_uri.endsWith("/perfil")
    )
      return NextResponse.json({ error: "bad redirect_uri" }, { status: 400 });
    const { ok, data } = await tokenRequest({
      code: body.code,
      client_id: cid,
      client_secret: secret,
      redirect_uri: body.redirect_uri,
      grant_type: "authorization_code",
    });
    if (!ok || !data?.access_token)
      return NextResponse.json({ error: data?.error ?? "exchange failed" }, { status: 502 });
    const res = NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in ?? 3600,
    });
    if (data.refresh_token) res.cookies.set(RT_COOKIE, data.refresh_token, cookieOpts());
    return res;
  }

  // refresh path — the cookie carries the refresh token
  const rt = req.cookies.get(RT_COOKIE)?.value;
  if (!rt) return NextResponse.json({ error: "no refresh token" }, { status: 401 });
  const { ok, data } = await tokenRequest({
    refresh_token: rt,
    client_id: cid,
    client_secret: secret,
    grant_type: "refresh_token",
  });
  if (!ok || !data?.access_token) {
    // a revoked refresh token means "not connected" — drop the cookie
    const res = NextResponse.json(
      { error: data?.error ?? "refresh failed" },
      { status: 401 }
    );
    res.cookies.set(RT_COOKIE, "", { ...cookieOpts(), maxAge: 0 });
    return res;
  }
  const res = NextResponse.json({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3600,
  });
  if (data.refresh_token) res.cookies.set(RT_COOKIE, data.refresh_token, cookieOpts());
  return res;
}

export async function DELETE(req: NextRequest) {
  sweepBuckets();
  if (!rateLimit(`gcal-del:${clientKey(req)}`, 30, 3_600_000))
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  const rt = req.cookies.get(RT_COOKIE)?.value;
  if (rt) {
    // best-effort revoke — don't fail the disconnect on it
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`,
      { method: "POST", signal: AbortSignal.timeout(5000) }
    ).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(RT_COOKIE, "", { ...cookieOpts(), maxAge: 0 });
  return res;
}
