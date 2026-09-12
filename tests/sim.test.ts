import { it } from "vitest";
import { applyResult, initState, pickPractice, nodeById, vocabById } from "@/lib/engine";
import type { Profile } from "@/lib/types";

const profile: Profile = {
  name: "Ana", level: "hsk1",
  interests: ["comida","viagens","familia","culinaria","cultura"],
  moments: [
    {id:"cafe",time:"08:00",enabled:true},
    {id:"almoco",time:"12:30",enabled:true},
    {id:"tarde",time:"17:30",enabled:true},
    {id:"noite",time:"20:30",enabled:true},
  ],
  selfConfidence:"low", createdAt: Date.now(),
};

it("simulates 7 days of dialogues", () => {
  const s = initState(profile);
  const DAY = 86400000;
  let t = Date.now() - 7*DAY;
  const counts: Record<string, number> = {};
  let fails = 0, oks = 0, helps = 0, news = 0, rec = 0, scripted = 0;
  for (let d = 0; d < 7; d++) {
    for (const m of ["cafe","almoco","tarde","noite"] as const) {
      const p = pickPractice(s, m, t);
      if (!p) continue;
      const tgt = p.target.startsWith("v:") ? vocabById.get(p.target)!.w : nodeById.get(p.target)!.label;
      const roll = (d * 7 + m.length * 3 + p.dialogue.id.length) % 10;
      const outcome = roll < 1 ? "fail" : roll < 4 ? "ok-help" : "ok";
      const hl = outcome === "ok" ? 0 : outcome === "ok-help" ? 1 + (d % 2) : 2;
      const opener = p.dialogue.turns[0].role === "eita" ? p.dialogue.turns[0].zh : "";
      console.log(`d${d} ${m.padEnd(7)} ${p.dialogue.id.padEnd(22)} ${tgt.padEnd(6)} ${outcome}${p.recovery ? " [REC]" : ""}${p.isNew ? " [NEW]" : ""}  ${opener}`);
      counts[p.dialogue.id] = (counts[p.dialogue.id] || 0) + 1;
      if (outcome === "fail") fails++; else if (outcome === "ok-help") helps++; else oks++;
      if (p.isNew) news++;
      if (p.recovery) rec++;
      if (!p.dialogue.id.startsWith("gen:")) scripted++;
      applyResult(s, { target: p.target, moment: m, dialogueId: p.dialogue.id }, outcome as "ok"|"ok-help"|"fail", hl, t);
    }
    t += DAY;
  }
  const known = Object.values(s.concepts).filter(c => c.intro && c.f >= 0.55).length;
  const learning = Object.values(s.concepts).filter(c => c.intro && c.f < 0.55).length;
  console.log({ oks, helps, fails, news, rec, scripted, total: s.interactions.length, known, learning, pressure: s.confidencePressure.toFixed(2) });
});
