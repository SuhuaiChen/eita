// Keeps the exercise previewed on the Today card identical to the one the
// practice screen runs (engine picks are random — cache per moment).
import type { MomentId } from "./types";
import type { Practice } from "./engine";

const cache = new Map<MomentId, { at: number; practice: Practice }>();

export function cachePractice(m: MomentId, p: Practice) {
  cache.set(m, { at: Date.now(), practice: p });
}

export function takePractice(m: MomentId, maxAgeMs = 5 * 60_000): Practice | null {
  const e = cache.get(m);
  if (e && Date.now() - e.at < maxAgeMs) {
    cache.delete(m);
    return e.practice;
  }
  return null;
}
