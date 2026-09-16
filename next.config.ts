import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self)" },
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
      "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://*.supabase.co wss://*.supabase.co",
      "font-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
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
