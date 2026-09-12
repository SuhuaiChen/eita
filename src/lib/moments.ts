import type { MomentId, MomentSetting } from "./types";

export type MomentStatus = "now" | "soon" | "tomorrow" | "done";

export interface CurrentMoment {
  id: MomentId;
  status: MomentStatus;
  at: Date;
}

const WINDOW_MIN = 100; // a moment stays "now" for ~1h40 after its time

export function currentMoment(moments: MomentSetting[], now = new Date()): CurrentMoment | null {
  const enabled = moments.filter((m) => m.enabled);
  if (!enabled.length) return null;
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = [...enabled].sort((a, b) => mins(a.time) - mins(b.time));

  // most recent moment still inside its window
  for (const m of [...sorted].reverse()) {
    const t = mins(m.time);
    if (t <= nowMin && nowMin - t <= WINDOW_MIN)
      return { id: m.id, status: "now", at: new Date(now) };
  }
  // next upcoming today
  for (const m of sorted) {
    const t = mins(m.time);
    if (t > nowMin) {
      const at = new Date(now);
      at.setHours(Math.floor(t / 60), t % 60, 0, 0);
      return { id: m.id, status: "soon", at };
    }
  }
  // earliest tomorrow
  const m = sorted[0];
  const t = mins(m.time);
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(Math.floor(t / 60), t % 60, 0, 0);
  return { id: m.id, status: "tomorrow", at };
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
