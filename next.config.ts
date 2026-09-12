import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the browser preview proxies through 127.0.0.1 — allow its dev-origin
  // requests so the client bundle/HMR can load
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
