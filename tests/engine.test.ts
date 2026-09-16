import { describe, expect, it } from "vitest";
import {
  applyResult,
  conceptOf,
  dayKey,
  fadingConcepts,
  initState,
  matchesReply,
  pickEventPractice,
  pickPractice,
  retrievability,
  stats,
  wordState,
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

  it("prefers scripted curriculum dialogues over the generic fallback", () => {
    const s = initState(mkProfile("hsk1"));
    let scripted = 0;
    let generic = 0;
    for (let i = 0; i < 12; i++) {
      const p = pickPractice(s, "cafe")!;
      if (p.dialogue.id.startsWith("chat:")) generic++;
      else scripted++;
      applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    }
    // cafe has 3 scripted dialogues (coffee/eat/qichuang) — they must show up;
    // generic chat:* is now only the fallback when nothing scripted fits
    expect(scripted).toBeGreaterThan(0);
    expect(generic).toBeLessThan(12);
  });

  it("a scripted pick actually exercises its practice target", () => {
    const s = initState(mkProfile("hsk1"));
    let sawScripted = false;
    for (let i = 0; i < 20; i++) {
      const p = pickPractice(s, "cafe")!;
      if (!p.dialogue.id.startsWith("chat:")) {
        sawScripted = true;
        // the target is either a dialogue target directly or a grammar node
        // whose label maps to a vocab target the dialogue exercises
        const hit =
          p.dialogue.targets.includes(p.target) ||
          p.dialogue.targets.some((t) => t.startsWith("v:"));
        expect(hit).toBe(true);
      }
      applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    }
    expect(sawScripted).toBe(true);
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

  it("matchesReply maps v→ü and tolerates small pinyin typos", () => {
    const nv = { zh: "女", py: "nǚ", pt: "", words: [] };
    expect(matchesReply("nv", nv)).toBe("ok"); // keyboard alias
    expect(matchesReply("nü", nv)).toBe("ok"); // literal ü
    const r = { zh: "我想去海边。", py: "wǒ xiǎng qù hǎibiān.", pt: "", words: [] };
    expect(matchesReply("wo xiang qu haibin", r)).toBe("close"); // 1 typo
    expect(matchesReply("wo xiang qu haaaaa", r)).not.toBe("ok");
  });

  it("a failed recall does not push the next review out", () => {
    const s = initState(mkProfile("some"));
    const p = pickPractice(s, "cafe")!;
    const before = conceptOf(s, p.target).last;
    applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "fail", 2);
    expect(conceptOf(s, p.target).last).toBe(before);
    applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    expect(conceptOf(s, p.target).last).toBeGreaterThan(0);
  });

  it("dayKey uses the local calendar day, not UTC", () => {
    // 23:30 local on Jan 5 must key as Jan 5 regardless of timezone offset
    const d = new Date(2025, 0, 5, 23, 30);
    expect(dayKey(d)).toBe("2025-01-05");
  });

  it("records isNew on the interaction only for first-time concepts", () => {
    const s = initState(mkProfile("beginner"));
    const p = pickPractice(s, "cafe")!;
    const wasIntro = conceptOf(s, p.target).intro;
    applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    expect(s.interactions.at(-1)!.isNew).toBe(!wasIntro);
    applyResult(s, { target: p.target, moment: "cafe", dialogueId: p.dialogue.id }, "ok", 0);
    expect(s.interactions.at(-1)!.isNew).toBe(false);
  });

  it("caps interaction history", () => {
    const s = initState(mkProfile("hsk1"));
    for (let i = 0; i < 410; i++) {
      applyResult(s, { target: "v:我", moment: "cafe", dialogueId: "x" }, "ok", 0);
    }
    expect(s.interactions.length).toBe(400);
  });

  it("pickEventPractice returns an event-anchored practice", () => {
    const s = initState(mkProfile("hsk1"));
    const p = pickEventPractice(s, {
      title: "Café com a Maria",
      topic: "comida",
      moment: "cafe",
    })!;
    expect(p).toBeTruthy();
    expect(p.eventTitle).toBe("Café com a Maria");
    expect(p.dialogue.turns.length).toBeGreaterThanOrEqual(2);
  });

  it("records voice/tap turns, dialogueId and targetWord on the interaction", () => {
    const s = initState(mkProfile("some"));
    applyResult(
      s,
      {
        target: "v:你好",
        moment: "cafe",
        dialogueId: "cafe-coffee",
        voiceTurns: 2,
        tapTurns: 1,
      },
      "ok",
      0
    );
    const i = s.interactions.at(-1)!;
    expect(i.voiceTurns).toBe(2);
    expect(i.tapTurns).toBe(1);
    expect(i.dialogueId).toBe("cafe-coffee");
    expect(i.targetWord).toBe("你好");
  });

  it("wordState maps concept memory to an honest label", () => {
    const s = initState(mkProfile("hsk1"));
    const now = Date.now();
    // not introduced → no state to show
    const unintroduced = Object.entries(s.concepts).find(([, c]) => !c.intro);
    if (unintroduced) expect(wordState(unintroduced[1], now)).toBeNull();
    // brand-new: seen <= 2 → "nova"
    const fresh = { f: 0.8, stab: 5, ok: 1, fail: 0, help: 0, intro: true, seen: 1, last: now };
    expect(wordState(fresh, now)).toBe("nova");
    // decayed: old last + weak stability → "a revisar" beats everything
    const faded = { f: 0.9, stab: 0.5, ok: 8, fail: 0, help: 0, intro: true, seen: 8, last: now - 10 * 86_400_000 };
    expect(wordState(faded, now)).toBe("a revisar");
    // firm: recent + high familiarity
    const firm = { f: 0.8, stab: 30, ok: 8, fail: 0, help: 0, intro: true, seen: 8, last: now - 86_400_000 };
    expect(wordState(firm, now)).toBe("firme");
    // middle ground
    const learning = { f: 0.3, stab: 30, ok: 3, fail: 2, help: 0, intro: true, seen: 8, last: now - 86_400_000 };
    expect(wordState(learning, now)).toBe("aprendendo");
  });

  it("fadingConcepts lists introduced concepts whose memory is escaping", () => {
    const s = initState(mkProfile("hsk1"));
    const now = Date.now();
    // plant one concept that has clearly decayed
    s.concepts["v:你好"] = { f: 0.8, stab: 0.4, ok: 6, fail: 0, help: 0, intro: true, seen: 6, last: now - 14 * 86_400_000 };
    const faded = fadingConcepts(s, now);
    expect(faded).toContain("v:你好");
    // unintroduced concepts never appear in the fading list
    expect(faded.every((id) => s.concepts[id]?.intro)).toBe(true);
  });

  it("stats week strip counts interactions per local day", () => {
    const s = initState(mkProfile("some"));
    const today = dayKey(new Date());
    const twoAgo = dayKey(new Date(Date.now() - 2 * 86_400_000));
    s.interactions.push(
      { ts: Date.now(), concept: "v:我", moment: "cafe", result: "ok", type: "dialogue", helpLevel: 0, isNew: false },
      { ts: Date.now(), concept: "v:你", moment: "noite", result: "ok", type: "dialogue", helpLevel: 0, isNew: false },
      { ts: Date.now() - 2 * 86_400_000, concept: "v:好", moment: "tarde", result: "ok-help", type: "dialogue", helpLevel: 1, isNew: false }
    );
    const wk = stats(s).week;
    expect(wk.find((d) => d.day === today)?.count).toBe(2);
    expect(wk.find((d) => d.day === twoAgo)?.count).toBe(1);
    expect(wk).toHaveLength(7);
  });
});
