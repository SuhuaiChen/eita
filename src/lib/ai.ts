// Client helper for AI-personalized dialogues via /api/dialogue.
// Returns null on any failure — callers fall back to scripted dialogues.
// Prefetched when the agenda renders so the tap feels instant.
import type { AgendaItem } from "./calendar";
import { knownWords, momentById, segment, vocabById } from "./engine";
import type { Dialogue, LearnerState } from "./types";

const pending = new Map<string, Promise<Dialogue | null>>();

/** fire-and-forget generation; pratica awaits the same promise later */
export function prefetchEventDialogue(state: LearnerState, ev: AgendaItem) {
  if (!pending.has(ev.id)) {
    pending.set(ev.id, request(state, ev, 20_000));
  }
}

export function aiDialogueForEvent(
  state: LearnerState,
  ev: AgendaItem
): Promise<Dialogue | null> {
  prefetchEventDialogue(state, ev);
  return pending.get(ev.id)!;
}

async function request(
  state: LearnerState,
  ev: AgendaItem,
  timeoutMs: number
): Promise<Dialogue | null> {
  const target = ev.topic;
  const topical = Object.keys(state.concepts).find(
    (id) =>
      id.startsWith("v:") &&
      vocabById.get(id)?.topics.includes(target) &&
      !state.concepts[id].intro
  );
  const v = topical ? vocabById.get(topical) : undefined;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/dialogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        moment: ev.moment,
        momentLabel: momentById(ev.moment).label,
        eventTitle: ev.title,
        eventWhen: ev.start.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        targetWord: v?.w,
        targetPt: v?.pt,
        knownWords: knownWords(state),
        learnerName: state.profile?.name,
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Dialogue;
    if (!d.turns?.length) return null;
    // word segments power the colored, tap-to-define chips in the UI
    for (const t of d.turns) {
      if (t.role === "eita") t.words ??= segment(t.zh);
      else
        for (const r of t.replies) {
          r.words ??= segment(r.zh);
          if (r.follow) r.follow.words ??= segment(r.follow.zh);
        }
    }
    return d;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
