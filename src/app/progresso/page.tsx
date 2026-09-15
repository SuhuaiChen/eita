"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { useLearner } from "@/lib/store";
import { conceptOf, nodeById, retrievability, stats, vocabById } from "@/lib/engine";
import { speak } from "@/lib/tts";
import type { ConceptId, LearnerState } from "@/lib/types";

/** dominance 1..5 — familiarity blended with how well it survives forgetting */
function dominance(state: LearnerState, id: ConceptId, now: number): number {
  const c = conceptOf(state, id);
  if (!c.intro) return 0;
  const d = c.f * 0.6 + retrievability(c, now) * 0.4;
  return Math.max(1, Math.min(5, Math.round(d * 5)));
}

const DOM_LABEL = ["", "começando", "aprendendo", "conhecendo", "firme", "dominado"];

function Dots({ n }: { n: number }) {
  return (
    <span className="flex gap-1" aria-label={`domínio ${n} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${i <= n ? "bg-jade" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

export default function Progresso() {
  const { state, ready } = useLearner();
  const router = useRouter();
  // eslint-disable-next-line react-hooks/purity -- stats snapshot at mount
  const now = useMemo(() => Date.now(), []);
  const [showAllV, setShowAllV] = useState(false);
  const [showAllG, setShowAllG] = useState(false);

  useEffect(() => {
    if (ready && !state.profile) router.replace("/onboarding");
  }, [ready, state.profile, router]);

  const bank = useMemo(() => {
    const entries = Object.entries(state.concepts).filter(([, c]) => c.intro);
    const vocab = entries
      .filter(([id]) => id.startsWith("v:"))
      .map(([id]) => ({ id, dom: dominance(state, id, now) }))
      .sort((a, b) => b.dom - a.dom || a.id.localeCompare(b.id));
    const gram = entries
      .filter(([id]) => id.startsWith("g:"))
      .map(([id]) => ({ id, dom: dominance(state, id, now) }))
      .sort((a, b) => b.dom - a.dom || a.id.localeCompare(b.id));
    return { vocab, gram };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.concepts, now]);

  if (!ready || !state.profile) return null;

  const s = stats(state, now);
  const dayNames = ["D", "S", "T", "Q", "Q", "S", "S"];
  const strong = bank.vocab.filter((v) => v.dom >= 4).length;

  return (
    <Shell>
      <h1 className="text-[2rem] font-bold">O que você já conquistou</h1>

      <div className="rise mt-6 rounded-3xl bg-surface p-6 shadow-[0_6px_30px_rgba(60,40,20,0.08)]">
        <p className="text-center text-[3rem] font-bold text-jade">{bank.vocab.length}</p>
        <p className="text-center text-[1.15rem] text-muted">
          palavras no seu banco · {strong} já firmes
        </p>
        <div className="mt-4 flex justify-between rounded-2xl bg-paper px-4 py-3">
          {s.week.map((d, i) => {
            const wd = new Date(d.day + "T12:00:00").getDay();
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span
                  aria-label={`${d.count} ${d.count === 1 ? "conversinha" : "conversinhas"}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[0.95rem] font-semibold ${
                    d.count > 0 ? "bg-jade text-white" : "bg-surface text-muted"
                  }`}
                >
                  {d.count > 0 ? d.count : "·"}
                </span>
                <span className="text-[0.8rem] text-muted" aria-hidden="true">{dayNames[wd]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- vocab bank ---------- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Banco de vocabulário
          </p>
          <p className="text-[0.85rem] text-muted">{bank.vocab.length} palavras</p>
        </div>
        <div className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-surface">
          {(showAllV ? bank.vocab : bank.vocab.slice(0, 12)).map(({ id, dom }) => {
            const v = vocabById.get(id);
            if (!v) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-20 shrink-0">
                  <p lang="zh-CN" className="zh text-[1.5rem] font-medium leading-tight">{v.w}</p>
                  <p className="py text-[0.9rem]">{v.p}</p>
                </div>
                <p className="min-w-0 flex-1 truncate text-[1rem] text-muted">{v.pt}</p>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Dots n={dom} />
                  <span className="text-[0.75rem] text-muted">{DOM_LABEL[dom]}</span>
                </div>
                <button
                  onClick={() => speak(v.w)}
                  className="ml-1 flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full bg-paper text-[1.05rem] active:bg-line"
                  aria-label={`Ouvir ${v.w}`}
                >
                  <span aria-hidden="true">🔊</span>
                </button>
              </div>
            );
          })}
        </div>
        {bank.vocab.length > 12 && (
          <button
            onClick={() => setShowAllV((x) => !x)}
            className="mt-2 min-h-12 w-full py-3 text-center text-[1rem] text-muted underline underline-offset-4"
          >
            {showAllV ? "Mostrar menos" : `Ver todas as ${bank.vocab.length}`}
          </button>
        )}
      </section>

      {/* ---------- grammar bank ---------- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Banco de gramática
          </p>
          <p className="text-[0.85rem] text-muted">{bank.gram.length} estruturas</p>
        </div>
        <div className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-surface">
          {bank.gram.length === 0 && (
            <p className="px-4 py-5 text-[1rem] text-muted">
              As estruturas de frase aparecem aqui conforme você conversa.
            </p>
          )}
          {(showAllG ? bank.gram : bank.gram.slice(0, 10)).map(({ id, dom }) => {
            const n = nodeById.get(id);
            if (!n) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[1.1rem] font-medium leading-tight">
                    <span lang="zh-CN" className="zh">{n.label}</span>
                    <span className="text-muted"> · {n.pt}</span>
                  </p>
                  <p className="truncate text-[0.9rem] text-muted">{n.ptn}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Dots n={dom} />
                  <span className="text-[0.75rem] text-muted">{DOM_LABEL[dom]}</span>
                </div>
                <button
                  onClick={() => speak(n.exs[0]?.hz ?? n.label)}
                  className="ml-1 flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full bg-paper text-[1.05rem] active:bg-line"
                  aria-label={`Ouvir exemplo de ${n.label}`}
                >
                  <span aria-hidden="true">🔊</span>
                </button>
              </div>
            );
          })}
        </div>
        {bank.gram.length > 10 && (
          <button
            onClick={() => setShowAllG((x) => !x)}
            className="mt-2 min-h-12 w-full py-3 text-center text-[1rem] text-muted underline underline-offset-4"
          >
            {showAllG ? "Mostrar menos" : `Ver todas as ${bank.gram.length}`}
          </button>
        )}
      </section>

      <div className="rise mt-7 rounded-2xl bg-jade-soft p-5">
        <p className="text-[1.1rem] leading-relaxed text-jade">
          {state.interactions.length === 0
            ? "Cada conversa rega o seu jardim de palavras. A gente começa devagar."
            : s.noHelpRate >= 0.7
              ? "Você está respondendo cada vez mais sem ajuda. Isso é progresso de verdade."
              : s.noHelpRate >= 0.4
                ? "Você pede ajuda quando precisa — e acerta. Isso também é aprender."
                : "Você continua voltando. É assim que se aprende um idioma."}
        </p>
      </div>
    </Shell>
  );
}
