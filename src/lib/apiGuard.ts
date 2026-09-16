// Shared hardening for API routes that proxy paid services.
// - per-IP token bucket (in-memory: correct on a single instance, and a sane
//   floor even when serverless instances each get their own bucket)
// - request body validation helpers
// This is cost protection, not auth — the goal is "nobody can burn the
// OpenAI key by curl-ing the endpoint in a loop".

interface Bucket {
  tokens: number;
  at: number;
}

const buckets = new Map<string, Bucket>();

/** sliding refill token bucket; `limit` requests per `windowMs` per key */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, at: now };
  // refill proportionally to elapsed time
  b.tokens = Math.min(limit, b.tokens + ((now - b.at) / windowMs) * limit);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/** best-effort client IP from the platform's forwarding headers */
export function clientKey(req: Request): string {
  const h = (n: string) => req.headers.get(n) ?? "";
  const fwd = h("x-forwarded-for").split(",")[0].trim();
  return fwd || h("x-real-ip") || "anon";
}

// housekeeping: don't let the map grow forever under churn
const SWEEP_EVERY = 60_000;
let lastSweep = 0;
export function sweepBuckets(maxAgeMs = 10 * 60_000) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now - b.at > maxAgeMs) buckets.delete(k);
}

/** cap a string field: absent → undefined; overlong → truncated marker */
export function boundedStr(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  return v.slice(0, max);
}

/** cap an array of strings */
export function boundedStrs(v: unknown, maxItems = 60, maxLen = 40): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .slice(0, maxItems)
    .map((x) => x.slice(0, maxLen));
}
