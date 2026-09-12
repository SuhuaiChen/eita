import { describe, expect, it } from "vitest";
import {
  applyResult,
  conceptOf,
  initState,
  matchesReply,
  pickPractice,
  retrievability,
} from "@/lib/engine";
import type { Dialogue, LearnerState, MomentId, Profile } from "@/lib/types";

const mkProfile = (level: Profile["level"]): Profile => ({
  name: "Ana",
  level,
  interests: ["comida", "familia", "viagens", "culinaria", "cultura"],
  moments: [
    { id: "cafe", time: "08:00", enabled: true },
    { id: "almoco", time: "12:30", enabled: true },
    { id: "tarde", time: "17:30", enabled: true },
    { id: "noite", time: "20:30", enabled: true },
  ],
  selfConfidence: "medium",
  createdAt: Date.now(),
});

const MOMENTS: MomentId[] = ["cafe", "almoco", "tarde", "noite"];

function validDialogue(s: LearnerState, m: MomentId): Dialogue {
  const p = pickPractice(s, m);
  expect(p).toBeTruthy();
  const d = p!.dialogue;
  expect(d.turns.length).toBeGreaterThanOrEqual(3);
  expect(d.turns.length).toBeLessThanOrEqual(4);
  expect(d.turns[0].role).toBe("eita");
  // opens with a question or an intro line
  const learnerTurns = d.turns.filter((t) => t.role === "learner");
  expect(learnerTurns.length).toBeGreaterThanOrEqual(1);
  for (const t of learnerTurns) {
    if (t.role !== "learner") continue;
    expect(t.replies.length).toBeGreaterThanOrEqual(2);
    for (const r of t.replies) {
      expect(r.zh.length).toBeGreaterThan(0);
      expect(r.pt.length).toBeGreaterThan(0);
    }
    if (t.kind === "check")
      expect(t.replies.filter((r) => r.ok).length).toBe(1);
  }
  // every eita line carries zh + pt
  for (const t of d.turns)
    if (t.role === "eita") {
      expect(t.zh.length).toBeGreaterThan(0);
      expect(t.pt.length).toBeGreaterThan(0);
    }
  return d;
}

describe("engine", () => {
  for (const level of ["beginner", "some", "hsk1", "hsk2"] as const) {
    it(`produces valid dialogues for level=${level} across all moments`, () => {
      const s = initState(mkProfile(level));
      for (const m of MOMENTS) {
        for (let i = 0; i < 6; i++) {
          const p = pickPractice(s, m)!;
          validDialogue(s, m);
          applyResult(
            s,
            { target: p.target, moment: m, dialogueId: p.dialogue.id },
            i % 3 === 0 ? "ok-help" : "ok",
            i % 3 === 0 ? 1 : 0
          );
        }
      }
    });
  }

  it("uses a time-aware conversation for the current moment", () => {
    const s = initState(mkProfile("hsk1"));
    let conversations = 0;
    for (let i = 0; i < 12; i++) {
      const p = pickPractice(s, "cafe")!;
      if (p.dialogue.id.startsWith("chat:cafe:")) conversations++;
      applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    }
    expect(conversations).toBe(12);
  });

  it("introduces new concepts when nothing is due", () => {
    const s = initState(mkProfile("beginner"));
    let sawNew = false;
    for (let i = 0; i < 30 && !sawNew; i++) {
      const p = pickPractice(s, "cafe");
      if (p?.isNew) sawNew = true;
      if (p) applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    }
    expect(sawNew).toBe(true);
  });

  it("switches to recovery mode after failures", () => {
    const s = initState(mkProfile("hsk1"));
    for (let i = 0; i < 3; i++) {
      const p = pickPractice(s, "almoco")!;
      applyResult(s, { target: p.target, moment: "almoco", dialogueId: p.dialogue.id }, "fail", 2);
    }
    expect(s.confidencePressure).toBeGreaterThanOrEqual(0.5);
    const p = pickPractice(s, "almoco")!;
    expect(p.recovery).toBe(true);
    // Recovery stays conversational; it never switches to a meaning quiz.
    expect(
      p.dialogue.turns.some((t) => t.role === "learner" && t.kind === "choice")
    ).toBe(true);
  });

  it("raises familiarity on success and keeps retrievability sane", () => {
    const s = initState(mkProfile("some"));
    const p = pickPractice(s, "cafe")!;
    const before = conceptOf(s, p.target).f;
    applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    const after = conceptOf(s, p.target);
    expect(after.f).toBeGreaterThan(before);
    expect(after.last).toBeGreaterThan(0);
    expect(retrievability(after, Date.now())).toBeGreaterThan(0.9);
    expect(retrievability(after, Date.now() + 30 * 86_400_000)).toBeLessThan(0.5);
  });

  it("matchesReply accepts hanzi and toneless pinyin", () => {
    const r = { zh: "我想去海边。", py: "wǒ xiǎng qù hǎibiān.", pt: "", words: [] };
    expect(matchesReply("我想去海边", r)).toBe("ok");
    expect(matchesReply("wo xiang qu haibian", r)).toBe("ok");
    expect(matchesReply("zzzz", r)).toBe("no");
  });
});
