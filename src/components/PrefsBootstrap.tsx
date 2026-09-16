"use client";

import { useEffect } from "react";
import { applyPrefs, loadPrefs } from "@/lib/prefs";
import { installErrorTracking } from "@/lib/telemetry";

/** boot-time client work: appearance prefs + error telemetry + PWA */
export default function PrefsBootstrap() {
  useEffect(() => {
    applyPrefs(loadPrefs());
    installErrorTracking();
    // service worker only in production — dev caching would fight HMR
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
