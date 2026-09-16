"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import BigButton from "@/components/BigButton";
import { useLearner } from "@/lib/store";
import {
  conceptOf,
  curriculum,
  dayKey,
  fadingConcepts,
  momentById,
  nodeById,
  stats,
  vocabById,
  wordState,
  type WordState,
} from "@/lib/engine";
import { speak } from "@/lib/tts";
import type { ConceptId, LearnerState } from "@/lib/types";

const WS_META: Record<WordState, { label: string; fg: string; bg: string; expl: string }> = {
  nova: { label: "nova", fg: "text-accent-deep", bg: "bg-accent-soft", expl: "você acabou de conhecer" },
  aprendendo: { label: "aprendendo", fg: "text-ink", bg: "bg-paper", expl: "começando a fixar" },
  firme: { label: "firme", fg: "text-jade", bg: "bg-jade-soft", expl: "você lembra com facilidade" },
  "a revisar": { label: "a revisar", fg: "text-hint", bg: "bg-hint-soft", expl: "está escapando — vale revisitar" },
};

const DAY_MS = 86_400_000;

function Chip({ ws }: { ws: WordState }) {
  const m = WS_META[ws];
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-[0.8rem] font-medium ${m.bg} ${m.fg}`}>
      {m.label}
    </span>
  );
}

function milestones(state: LearnerState): { icon: string; label: string; on: boolean }[] {
  const intro = Object.values(state.concepts).filter((c) => c.intro).length;
  const firmes = Object.values(state.concepts).filter((c) => c.intro && c.f >= 0.55).length;
  const days = new Set(state.interactions.map((i) => dayKey(i.ts))).size;
  const voices = state.interactions.reduce((n, i) => n + (i.voiceTurns ?? 0), 0);
  return [
    { icon: "🌱", label: "Primeira conversinha", on: state.interactions.length >= 1 },
    { icon: "📚", label: "Banco de 25 palavras", on: intro >= 25 },
    { icon: "📚", label: "Banco de 100 palavras", on: intro >= 100 },
    { icon: "💪", label: "10 palavras firmes", on: firmes >= 10 },
    { icon: "🗓️", label: "Uma semana de conversas", on: days >= 7 },
    { icon: "🎤", label: "Voz ativa (5 respostas faladas)", on: voices >= 5 },
  ];
}

export default function Progresso() {
  const { state, ready } = useLearner();
  const router = useRouter();
  // eslint-disable-next-line react-hooks/purity -- stats snapshot at mount
  const now = useMemo(() => Date.now(), []);
  const [showAllV, setShowAllV] = useState(false);
  const [showAllG, setShowAllG] = useState(false);
  const [openHist, setOpenHist] = useState<number | null>(null);
  const [wsInfo, setWsInfo] = useState<WordState | null>(null);

  useEffect(() => {
    if (ready && !state.profile) router.replace("/onboarding");
  }, [ready, state.profile, router]);

  const bank = useMemo(() => {
    const entries = Object.entries(state.concepts).filter(([, c]) => c.intro);
    const withWs = (id: ConceptId) => wordState(conceptOf(state, id), now)!;
    const rank = (ws: WordState) => (ws === "a revisar" ? 0 : ws === "nova" ? 1 : ws === "aprendendo" ? 2 : 3);
    const vocab = entries
      .filter(([id]) => id.startsWith("v:"))
      .map(([id]) => ({ id, ws: withWs(id) }))
      .sort((a, b) => rank(a.ws) - rank(b.ws) || a.id.localeCompare(b.id));
    const gram = entries
      .filter(([id]) => id.startsWith("g:"))
      .map(([id]) => ({ id, ws: withWs(id) }))
      .sort((a, b) => rank(a.ws) - rank(b.ws) || a.id.localeCompare(b.id));
    // words introduced BY a practice (not seeded from the level quiz)
    const learned = new Set(state.interactions.filter((i) => i.isNew).map((i) => i.concept));
    return { vocab, gram, learned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.concepts, state.interactions, now]);

  if (!ready || !state.profile) return null;

  const s = stats(state, now);
  const fading = fadingConcepts(state, now).slice(0, 5);
  const weekStart = now - 6 * DAY_MS;
  const weekInteractions = state.interactions.filter((i) => i.ts >= weekStart);
  const weekVoice = weekInteractions.reduce((n, i) => n + (i.voiceTurns ?? 0), 0);
  const weekNew = weekInteractions.filter((i) => i.isNew).length;
  const weekDays = new Set(weekInteractions.map((i) => dayKey(i.ts))).size;
  const learnedWithEita = bank.vocab.filter((v) => bank.learned.has(v.id)).length;
  const dayNames = ["D", "S", "T", "Q", "Q", "S", "S"];
  const history = [...state.interactions].reverse().slice(0, 8);
  const marks = milestones(state).filter((m) => m.on);

  return (
    <Shell>
      <h1 className="text-[2rem] font-bold">O que você já conquistou</h1>

      {/* ---------- weekly narrative ---------- */}
      <div className="rise mt-6 rounded-3xl bg-surface p-6 shadow-[0_6px_30px_rgba(60,40,20,0.08)]">
        <p className="text-center text-[1.2rem] leading-relaxed">
          Esta semana:{" "}
          <span className="font-bold text-jade">{weekInteractions.length}</span>{" "}
          {weekInteractions.length === 1 ? "conversinha" : "conversinhas"}
          {weekVoice > 0 && (
            <>
              {" · "}
              <span className="font-bold text-jade">{weekVoice}</span>{" "}
              {weekVoice === 1 ? "resposta falada" : "respostas faladas"}
            </>
          )}
          {weekNew > 0 && (
            <>
              {" · "}
              <span className="font-bold text-jade">{weekNew}</span>{" "}
              {weekNew === 1 ? "palavra nova" : "palavras novas"}
            </>
          )}
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
        {weekDays > 0 && (
          <p className="mt-3 text-center text-[0.95rem] text-muted">
            {weekDays === 1 ? "1 dia de prática" : `${weekDays} dias de prática`} nos últimos 7 dias
          </p>
        )}
      </div>

      {/* ---------- estão escapando — the actionable list ---------- */}
      {fading.length > 0 && (
        <section className="mt-7">
          <div className="rounded-3xl border-2 border-hint/40 bg-hint-soft p-5">
            <p className="text-[1.1rem] font-semibold text-hint">
              🍂 Estão escapando
            </p>
            <p className="mt-1 text-[0.95rem] text-muted">
              Essas palavras estão sumindo da memória — uma conversinha ajuda a trazer de volta.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fading.map((id) => {
                const v = vocabById.get(id);
                const n = nodeById.get(id);
                const w = v?.w ?? n?.label ?? id;
                return (
                  <button
                    key={id}
                    onClick={() => speak(w)}
                    aria-label={`Ouvir ${w}`}
                    className="flex min-h-11 items-center gap-1.5 rounded-full border border-hint/30 bg-surface px-3.5 text-[1rem]"
                  >
                    <span lang="zh-CN" className="zh font-medium">{w}</span>
                    <span className="text-[0.85rem] text-muted">{v?.pt?.split(/[;,]/)[0] ?? n?.pt ?? ""}</span>
                  </button>
                );
              })}
            </div>
            <BigButton big className="mt-4" onClick={() => router.push("/pratica")}>
              Revisar agora
            </BigButton>
          </div>
        </section>
      )}

      {/* ---------- já sabia vs aprendeu com o Eita ---------- */}
      <div className="rise mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4 text-center shadow-[0_4px_20px_rgba(60,40,20,0.06)]">
          <p className="text-[2rem] font-bold text-ink">{bank.vocab.length - learnedWithEita}</p>
          <p className="text-[0.95rem] text-muted">palavras que você já sabia</p>
        </div>
        <div className="rounded-2xl bg-jade-soft p-4 text-center">
          <p className="text-[2rem] font-bold text-jade">{learnedWithEita}</p>
          <p className="text-[0.95rem] text-jade">novas com o Eita</p>
        </div>
      </div>

      {/* ---------- milestones ---------- */}
      {marks.length > 0 && (
        <section className="mt-7">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Conquistas
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {marks.map((m, i) => (
              <span
                key={i}
                className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-jade/30 bg-jade-soft px-3.5 text-[0.95rem] text-jade"
              >
                <span aria-hidden="true">{m.icon}</span> {m.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ---------- últimas conversinhas ---------- */}
      {history.length > 0 && (
        <section className="mt-7">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Últimas conversinhas
          </p>
          <div className="mt-3 space-y-2">
            {history.map((h, i) => {
              const dlg = h.dialogueId ? curriculum.dialogues.find((d) => d.id === h.dialogueId) : undefined;
              const open = openHist === i;
              const d = new Date(h.ts);
              const when = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
              return (
                <div key={i} className="rounded-2xl border-2 border-line bg-surface">
                  <button
                    onClick={() => setOpenHist(open ? null : i)}
                    aria-expanded={open}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-[0.9rem] text-muted">{when}</span>
                    <span className="text-[1rem]">{momentById(h.moment).emoji}</span>
                    <span lang="zh-CN" className="zh min-w-0 flex-1 truncate text-[1.1rem] font-medium">
                      {h.targetWord ?? "—"}
                    </span>
                    {(h.voiceTurns ?? 0) > 0 && <span aria-label="respondeu falando" title="falou">🎤</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium ${
                      h.result === "ok" ? "bg-jade-soft text-jade" : h.result === "fail" ? "bg-hint-soft text-hint" : "bg-paper text-muted"
                    }`}>
                      {h.result === "ok" ? "sem ajuda" : h.result === "fail" ? "difícil" : "com dica"}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-line px-4 py-3">
                      {dlg ? (
                        <div className="space-y-2">
                          {dlg.turns.map((t, j) =>
                            t.role === "eita" ? (
                              <div key={j} className="rounded-xl bg-paper px-3 py-2">
                                <p lang="zh-CN" className="zh text-[1.1rem]">{t.zh}</p>
                                <p className="text-[0.85rem] text-muted">{t.pt}</p>
                              </div>
                            ) : (
                              <div key={j} className="rounded-xl bg-accent-soft px-3 py-2">
                                <p lang="zh-CN" className="zh text-[1.1rem]">{t.replies[0]?.zh}</p>
                                <p className="text-[0.85rem] text-muted">{t.replies[0]?.pt}</p>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <p className="text-[0.95rem] text-muted">
                          Conversinha gerada na hora — sem roteiro salvo.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- vocab bank ---------- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Banco de vocabulário
          </p>
          <p className="text-[0.85rem] text-muted">{bank.vocab.length} palavras</p>
        </div>
        <p className="mt-1 text-[0.85rem] text-muted">
          Toque num estado para entender o que ele significa.
        </p>
        <div className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-surface">
          {(showAllV ? bank.vocab : bank.vocab.slice(0, 12)).map(({ id, ws }) => {
            const v = vocabById.get(id);
            if (!v) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-20 shrink-0">
                  <p lang="zh-CN" className="zh text-[1.5rem] font-medium leading-tight">{v.w}</p>
                  <p className="py text-[0.9rem]">{v.p}</p>
                </div>
                <p className="min-w-0 flex-1 truncate text-[1rem] text-muted">{v.pt}</p>
                <button onClick={() => setWsInfo(ws)} aria-label={`Estado: ${WS_META[ws].label}`}>
                  <Chip ws={ws} />
                </button>
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
          {(showAllG ? bank.gram : bank.gram.slice(0, 10)).map(({ id, ws }) => {
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
                <button onClick={() => setWsInfo(ws)} aria-label={`Estado: ${WS_META[ws].label}`}>
                  <Chip ws={ws} />
                </button>
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

      {/* word-state explainer */}
      {wsInfo && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-ink/30 px-5 pb-10"
          role="dialog"
          aria-modal="true"
          onClick={() => setWsInfo(null)}
        >
          <div className="rise w-full max-w-md rounded-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-[1.2rem] font-bold">
              <Chip ws={wsInfo} />
            </p>
            <p className="mt-2 text-[1.1rem] text-muted">
              “{WS_META[wsInfo].label}” — {WS_META[wsInfo].expl}.
            </p>
            <BigButton className="mt-5" onClick={() => setWsInfo(null)}>
              Entendi
            </BigButton>
          </div>
        </div>
      )}
    </Shell>
  );
}
