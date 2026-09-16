"use client";

// Privacy-preserving product telemetry: event names + tiny metadata, never
// transcripts, names, or calendar content. Uses sendBeacon so it doesn't
// block or throw for the learner.

// client-side throttle — a render-loop error shouldn't beacon-storm
let sent = 0;
let windowStart = Date.now();
const MAX_PER_MIN = 60;

export function track(ev: string, meta?: Record<string, string | number | boolean>) {
  try {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      sent = 0;
    }
    if (sent++ >= MAX_PER_MIN) return;
    const body = JSON.stringify({ ev, meta });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/telemetry", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {}
}

/** installs global error hooks once — call from a root client component */
export function installErrorTracking() {
  if (typeof window === "undefined") return;
  const w = window as { __eitaTel?: boolean };
  if (w.__eitaTel) return;
  w.__eitaTel = true;
  window.addEventListener("error", (e) =>
    track("client.error", { msg: String(e.message).slice(0, 100) })
  );
  window.addEventListener("unhandledrejection", (e) =>
    track("client.rejection", { msg: String(e.reason).slice(0, 100) })
  );
}
