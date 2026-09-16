import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// pin connect-src to OUR Supabase project, not *.supabase.co — a wildcard
// there would let an XSS exfiltrate tokens to any attacker's project
const supaHost = (() => {
  try {
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return u ? ` https://${new URL(u).host}` : "";
  } catch {
    return "";
  }
})();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    // voice clips play from blob: URLs; Google/Supabase are the only
    // third-party connect targets; 'unsafe-inline' stays because Next injects
    // hydration scripts/styles (nonce-based CSP needs middleware — later)
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src blob:",
      `connect-src 'self' https://www.googleapis.com${supaHost}`,
      "font-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // the browser preview proxies through 127.0.0.1 — allow its dev-origin
  // requests so the client bundle/HMR can load
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    // prod-only: the dev server needs open connect/script sources for HMR
    return isProd ? [{ source: "/:path*", headers: securityHeaders }] : [];
  },
};

export default nextConfig;
