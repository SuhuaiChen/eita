"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BigButton from "./BigButton";
import type { Dialogue, DialogueLine, ReplyOption } from "@/lib/types";
import {
  glossesFor,
  matchesReply,
  momentById,
  nodeById,
  vocabById,
} from "@/lib/engine";
import { praise, pick } from "@/lib/copy";
import { speak, stopSpeak } from "@/lib/tts";
import { listen, speechSupported } from "@/lib/stt";
import { recorderSupported, startRecording } from "@/lib/recorder";
import { track } from "@/lib/telemetry";
import Celebration, { pickCelebration, type CheerSpec } from "./Celebration";

type Outcome = "ok" | "ok-help" | "fail";

type Rendered = DialogueLine & { key: string; mine?: boolean };

const isEita = (r: Rendered) => !r.mine;

// hint ladder rungs: 1 gloss → 2 pattern (pinyin shape) → 3 starter → 4 reveal
const MAX_HINT = 4;
// N misses on one turn (voice/typed/wrong pick) → we call it a struggle and
// move on gently — makes the recovery path reachable without punishing
const MAX_MISSES = 3;

// mid-dialogue resume: the thread snapshot is written on every advance and
// cleared on finish/exit; the practice itself is persisted by /pratica
export const RESUME_THREAD_KEY = "eita:resumeThread";
export interface ResumeThread {
  dialogueId: string;
  shown: Rendered[];
  idx: number;
}

const STT_ERRORS: Record<string, string> = {
  "not-allowed": "Permita o microfone nas configurações do navegador — ou toque numa resposta.",
  "service-not-allowed": "O serviço de voz está bloqueado neste navegador — toque numa resposta.",
  "no-speech": "Não ouvi nada — fale um pouco mais alto, ou toque numa resposta.",
  "audio-capture": "Não achei um microfone neste aparelho — toque numa resposta.",
  network: "Sem conexão para o reconhecimento de voz — toque numa resposta.",
};

export default function DialogueRunner({
  dialogue,
  recovery,
  context,
  learnerName,
  resume,
  onFinish,
  onExit,
}: {
  dialogue: Dialogue;
  recovery: boolean;
  context?: string;
  learnerName?: string;
  resume?: ResumeThread;
  onFinish: (outcome: Outcome, helpLevel: number, voiceTurns: number, tapTurns: number) => void;
  onExit: () => void;
}) {
  const router = useRouter();
  const turns = dialogue.turns;
  const moment = momentById(dialogue.moment);

  const [shown, setShown] = useState<Rendered[]>(resume?.shown ?? []);
  const [idx, setIdx] = useState(resume?.idx ?? 0); // next turn index to process
  const [done, setDone] = useState(false);

  const [hintLevel, setHintLevel] = useState(0);
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());
  const [typeMode, setTypeMode] = useState(false);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPt, setShowPt] = useState<Set<string>>(new Set());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastVoice, setLastVoice] = useState<{ heard: string; closest?: ReplyOption } | null>(null);
  const [voiceClip, setVoiceClip] = useState<string | null>(null);
  const [voiceDead, setVoiceDead] = useState(false);
  const [rehearse, setRehearse] = useState<{ key: string; listening: boolean; msg?: string; good?: boolean } | null>(null);
  const [cheer, setCheer] = useState<CheerSpec | null>(null);
  const [cheerFade, setCheerFade] = useState(false);
  const [selWord, setSelWord] = useState<{ key: string; i: number } | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const rehearseRecRef = useRef<{ stop: () => void } | null>(null);
  const clipRef = useRef<{ stop: () => Promise<string | null>; cancel: () => void } | null>(null);

  const anyHelp = useRef(false);
  const anyFail = useRef(false);
  const hintsUsed = useRef(0);
  const turnMisses = useRef(0);
  const advancing = useRef(false);
  const autoRetried = useRef(false);
  const sttErrs = useRef(0);
  const voiceTurns = useRef(0);
  const tapTurns = useRef(0);
  const lastInterim = useRef("");
  const scoredFinal = useRef(false);
  const overrides = useRef<Map<number, DialogueLine>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const focusedIdx = useRef(-1);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const current = turns[idx];
  const awaitingReply = !done && current?.role === "learner";
  // eita is "typing" while a eita turn waits for its reveal delay
  const typing = !done && current?.role === "eita" && idx < turns.length;

  function targetWord(): string {
    const t = dialogue.targets[0];
    return t?.startsWith("v:")
      ? vocabById.get(t)?.w ?? ""
      : nodeById.get(t)?.label ?? "";
  }

  // advance through eita turns with a short typing pause —
  // the effect only schedules; setState happens inside callbacks
  useEffect(() => {
    if (done) return;
    const t = turns[idx];
    if (!t) {
      queueMicrotask(() => {
        const out: Outcome = anyFail.current
          ? "fail"
          : anyHelp.current || hintsUsed.current > 0
            ? "ok-help"
            : "ok";
        setDone(true);
        setCheer(pickCelebration(out, learnerName));
        setFeedback(
          recovery && out !== "fail"
            ? pick(praise.recovery).replace("{w}", targetWord())
            : pick(out === "ok" ? praise.solo : out === "ok-help" ? praise.helped : praise.reveal)
        );
        track("practice.finish", {
          outcome: out,
          voice: voiceTurns.current,
          tap: tapTurns.current,
          recovery,
        });
        onFinishRef.current(out, Math.min(hintsUsed.current, MAX_HINT), voiceTurns.current, tapTurns.current);
        setTimeout(() => setCheerFade(true), 1700);
      });
      return;
    }
    if (t.role === "eita") {
      const id = setTimeout(
        () => {
          const line = overrides.current.get(idx) ?? t;
          setShown((s) => [...s, { ...line, key: `t${idx}` }]);
          setIdx((i) => i + 1);
          // auto-speak lines that are mostly Mandarin
          const cjk = (line.zh.match(/[㐀-鿿]/g) ?? []).length;
          const chars = line.zh.replace(/[\s。，？！,.!?]/g, "").length;
          if (chars > 0 && cjk / chars > 0.6) speak(line.zh);
        },
        idx === 0 ? 250 : 650
      );
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done]);

  // a new turn re-arms the double-tap guard, the miss counter, the auto-retry
  // allowance, and clears the previous attempt's voice feedback
  useEffect(() => {
    advancing.current = false;
    turnMisses.current = 0;
    autoRetried.current = false;
    queueMicrotask(() => {
      setLastVoice(null);
      setVoiceClip(null);
      setRehearse(null);
    });
  }, [idx]);

  // persist the thread so leaving mid-dialogue can resume (U4)
  useEffect(() => {
    try {
      if (done || idx === 0) sessionStorage.removeItem(RESUME_THREAD_KEY);
      else sessionStorage.setItem(RESUME_THREAD_KEY, JSON.stringify({ dialogueId: dialogue.id, shown, idx }));
    } catch {}
  }, [shown, idx, done, dialogue.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shown.length, typing, awaitingReply]);

  // keyboard/screen-reader focus: when a learner turn opens, land focus on the
  // reply block so the prompt and options are the next thing read (once per
  // turn — preventScroll because the bottom-anchor effect already scrolled)
  useEffect(() => {
    if (!awaitingReply || focusedIdx.current === idx) return;
    focusedIdx.current = idx;
    replyRef.current?.focus({ preventScroll: true });
  }, [awaitingReply, idx]);

  useEffect(
    () => () => {
      stopSpeak();
      recRef.current?.stop();
      rehearseRecRef.current?.stop();
      clipRef.current?.cancel();
    },
    []
  );

  /** capture the attempt for "ouça minha voz" — silently skipped if the device refuses */
  function armClip() {
    clipRef.current?.cancel();
    clipRef.current = recorderSupported() ? startRecording() : null;
  }

  function endClip(save: boolean) {
    const r = clipRef.current;
    clipRef.current = null;
    if (!r) return;
    if (save)
      r.stop().then((url) => {
        if (!url) return;
        setVoiceClip((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      });
    else r.cancel();
  }

  function stopListening() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    endClip(true);
  }

  function scoreSpeech(t: string, alts?: string[]) {
    if (current?.role !== "learner") return;
    const cands = alts?.length ? alts : [t];
    const scored = current.replies
      .flatMap((r, i) => cands.map((c) => ({ r, i, m: matchesReply(c, r) })))
      .sort((a, b) => (b.m === "ok" ? 1 : b.m === "close" ? 0.5 : 0) - (a.m === "ok" ? 1 : a.m === "close" ? 0.5 : 0));
    const best = scored[0];
    if (best?.m === "ok") {
      advanceWith(best.r, false, "voice");
    } else if (best?.m === "close") {
      // a near match is a real attempt — it counts as helped
      anyHelp.current = true;
      miss();
      setLastVoice({ heard: t, closest: best.r });
      setFeedback("Quase! Ouça e fale de novo:");
      speak(best.r.zh);
      // after a near miss we play the model then re-open the mic once —
      // seniors shouldn't have to re-tap to retry
      if (!autoRetried.current && !advancing.current) {
        autoRetried.current = true;
        setTimeout(() => {
          if (!advancing.current && !done) startListening();
        }, 1600);
      }
    } else {
      miss();
      // one garbled capture isn't a learning signal — only mark the
      // exercise "helped" when the misses repeat
      if (turnMisses.current >= 2) anyHelp.current = true;
      setLastVoice({ heard: t });
      setFeedback("Não entendi bem — tente de novo ou toque numa resposta.");
    }
  }

  /** a miss on this turn; after MAX_MISSES we reveal + move on as a soft fail */
  function miss() {
    turnMisses.current += 1;
    if (turnMisses.current >= MAX_MISSES) revealAndAdvance();
  }

  /** voice-first reply: match the transcript against this turn's options */
  function startListening() {
    if (current?.role !== "learner" || listening) return;
    stopSpeak(); // the mic must not hear Eita's model line and self-match
    setTranscript("");
    lastInterim.current = "";
    scoredFinal.current = false;
    setListening(true);
    armClip();
    const handle = listen({
      onResult: ({ transcript: t, final, alts }) => {
        setTranscript(t);
        if (!final) {
          lastInterim.current = t;
          return;
        }
        scoredFinal.current = true;
        stopListening();
        scoreSpeech(t, alts);
      },
      onEnd: () => {
        setListening(false);
        // seniors pause mid-sentence — if recognition ended without a final
        // result, score whatever interim we captured instead of dropping it
        if (!scoredFinal.current && lastInterim.current.trim()) {
          const t = lastInterim.current;
          lastInterim.current = "";
          scoredFinal.current = true;
          endClip(true);
          scoreSpeech(t);
        }
      },
      onError: (err) => {
        setListening(false);
        endClip(false);
        sttErrs.current += 1;
        track("stt.error", { err });
        if (sttErrs.current >= 2) setVoiceDead(true);
        setFeedback(STT_ERRORS[err] ?? "Não consegui ouvir — toque numa resposta.");
      },
    });
    if (!handle) {
      setListening(false);
      clipRef.current?.cancel();
      setVoiceDead(true);
      setFeedback("Não consigo ouvir sua voz neste aparelho — toque numa resposta.");
      return;
    }
    recRef.current = handle;
  }

  // ---------- rehearsal ("repita comigo") — shadow any eita line, no scoring ----

  function startRehearse(l: Rendered) {
    if (listening || rehearse?.listening) return;
    stopSpeak();
    const reply: ReplyOption = { zh: l.zh, py: l.py ?? "", pt: l.pt ?? "", words: l.words ?? [] };
    setRehearse({ key: l.key, listening: true });
    armClip();
    const handle = listen({
      onResult: ({ transcript: t, final, alts }) => {
        if (!final) return;
        rehearseRecRef.current = null;
        endClip(false); // rehearsal takes are discarded — nothing displays them
        const cands = alts?.length ? alts : [t];
        const m = cands.some((c) => matchesReply(c, reply) === "ok")
          ? "ok"
          : cands.some((c) => matchesReply(c, reply) === "close")
            ? "close"
            : "no";
        if (m === "ok") {
          setRehearse({ key: l.key, listening: false, msg: "Muito bem — soou natural!", good: true });
        } else if (m === "close") {
          setRehearse({ key: l.key, listening: false, msg: "Quase — ouça devagar e tente de novo." });
          speak(l.zh, { slow: true });
        } else {
          setRehearse({ key: l.key, listening: false, msg: "Não captei bem — tente de novo." });
        }
      },
      onEnd: () => {
        endClip(false);
        setRehearse((r) => (r?.listening ? { ...r, listening: false } : r));
      },
      onError: () => {
        endClip(false);
        setRehearse({ key: l.key, listening: false, msg: "Não consegui ouvir — toque de novo quando quiser." });
      },
    });
    if (!handle) {
      endClip(false);
      setRehearse({ key: l.key, listening: false, msg: "Voz indisponível neste aparelho." });
    }
    else rehearseRecRef.current = handle;
  }

  function stopRehearse() {
    rehearseRecRef.current?.stop();
    rehearseRecRef.current = null;
    endClip(false);
    setRehearse((r) => (r ? { ...r, listening: false } : r));
  }

  // ---------------------------------------------------------------------------

  function pickReply(r: ReplyOption, i: number) {
    if (!awaitingReply || current.role !== "learner" || advancing.current) return;
    advancing.current = true;
    stopListening();
    if (current.kind === "check" && !r.ok) {
      // gentle miss — hint then retry, then reveal
      const wrongs = current.replies.filter((x) => !x.ok).length;
      setWrongIds((w) => new Set(w).add(i));
      anyHelp.current = true;
      if (wrongIds.size + 1 >= Math.min(2, wrongs)) {
        // reveal correct and move on as a soft fail
        anyFail.current = true;
        setFeedback("Sem problema — essa a gente repete depois.");
        advanceWith(r, true, "auto");
      } else {
        miss();
        setHintLevel((h) => Math.max(h, 1));
        setFeedback(`${pick(praise.almost)} ${pick(praise.again)}`);
        advancing.current = false;
      }
      return;
    }
    advanceWith(r, false, "tap");
  }

  /** "não sei" — reveal the suggested reply, then move on as a soft fail */
  function revealAndAdvance() {
    if (advancing.current || current?.role !== "learner") return;
    advancing.current = true;
    const r = current.replies.find((x) => x.ok) ?? current.replies[0];
    anyFail.current = true;
    setHintLevel(MAX_HINT);
    setFeedback("Sem problema — olha como se diz:");
    speak(r.zh);
    setTimeout(() => advanceWith(r, true, "auto"), 1600);
  }

  function advanceWith(r: ReplyOption, failed: boolean, via: "voice" | "tap" | "typed" | "auto") {
    if (via === "voice") voiceTurns.current += 1;
    else if (via !== "auto") tapTurns.current += 1;
    if (!failed && r.follow && turns[idx + 1]?.role === "eita") {
      overrides.current.set(idx + 1, r.follow);
    }
    // reset per-turn helpers for the next learner turn
    setHintLevel(0);
    setWrongIds(new Set());
    setTypeMode(false);
    setTyped("");
    setFeedback(null);
    setLastVoice(null);
    setShown((s) => [
      ...s,
      { ...r, key: `u${idx}-${r.zh.slice(0, 4)}`, mine: true },
    ]);
    setIdx((i) => i + 1);
  }

  function checkTyped() {
    if (current?.role !== "learner" || advancing.current) return;
    const results = current.replies.map((r, i) => ({
      r,
      i,
      m: matchesReply(typed, r),
    }));
    const exact = results.find((x) => x.m === "ok");
    if (exact) {
      if (current.kind === "check" && !exact.r.ok) {
        pickReply(exact.r, exact.i);
        return;
      }
      advancing.current = true;
      advanceWith(exact.r, false, "typed");
      return;
    }
    const close = results.find((x) => x.m === "close");
    if (close) {
      anyHelp.current = true;
      miss();
      setFeedback("Quase — olhe de novo, ou toque numa resposta.");
      setTyped("");
      return;
    }
    anyHelp.current = true;
    miss();
    setHintLevel((h) => Math.max(h, 1));
    setFeedback(`${pick(praise.almost)} ${pick(praise.again)}`);
    setTyped("");
  }

  function help() {
    if (hintLevel >= MAX_HINT) return; // mashing 💡 shouldn't inflate helpLevel
    hintsUsed.current += 1;
    anyHelp.current = true;
    setHintLevel((h) => Math.min(h + 1, MAX_HINT));
  }

  const targetGloss = useMemo(() => {
    const t = dialogue.targets[0];
    if (!t) return null;
    const v = vocabById.get(t);
    const n = nodeById.get(t);
    return v ? { w: v.w, p: v.p, pt: v.pt } : n ? { w: n.label, p: "", pt: n.pt } : null;
  }, [dialogue]);

  // ---------- reply-area helpers ----------
  const learnerTurn = awaitingReply && current.role === "learner" ? current : null;
  const visibleReplies: ReplyOption[] = useMemo(() => {
    if (!learnerTurn) return [];
    if (learnerTurn.kind !== "check" || hintLevel < 1)
      return learnerTurn.replies.filter((_, i) => !wrongIds.has(i));
    // hint: keep correct + first wrong
    const okR = learnerTurn.replies.find((r) => r.ok)!;
    const firstWrong = learnerTurn.replies.find((r) => !r.ok);
    return learnerTurn.replies.filter(
      (r, i) => (r === okR || r === firstWrong) && !wrongIds.has(i)
    );
  }, [learnerTurn, hintLevel, wrongIds]);

  // the reply we'd suggest — first valid option
  const suggested = useMemo(() => {
    if (!learnerTurn) return null;
    return learnerTurn.replies.find((r) => r.ok) ?? learnerTurn.replies[0] ?? null;
  }, [learnerTurn]);

  const revealIdx = hintLevel >= MAX_HINT && suggested ? learnerTurn!.replies.indexOf(suggested) : -1;

  const hintBox = useMemo(() => {
    if (!learnerTurn || hintLevel === 0 || !suggested) return null;
    if (learnerTurn.kind === "check" && targetGloss) {
      if (hintLevel >= MAX_HINT) return { title: "Resposta", text: `${targetGloss.w} = ${targetGloss.pt}` };
      if (hintLevel >= 2) return { title: "Começo", text: `${targetGloss.w.slice(0, 1)}…` };
      return { title: "Dica", text: `Como se diz: ${targetGloss.p}` };
    }
    if (hintLevel >= MAX_HINT)
      return { title: "Você pode dizer", text: `${suggested.zh}\n${suggested.pt}` };
    if (hintLevel === 3)
      return { title: "Começo", text: `${suggested.words.slice(0, 2).join(" ")}…` };
    if (hintLevel === 2)
      return { title: "O som da frase", text: suggested.py || suggested.zh };
    return {
      title: "Palavras importantes",
      text: glossesFor(suggested.words).map((g) => `${g.w} ${g.pt}`).join("  ·  "),
    };
  }, [learnerTurn, hintLevel, targetGloss, suggested]);

  const voiceAvailable = speechSupported() && !voiceDead;

  // ---------- recap ----------
  const header = context
    ? `📅 ${context}`
    : `${moment.emoji} ${moment.label}`;

  if (done) {
    const lines = shown;
    return (
      <Card onExit={onExit} moment={header}>
        {cheer && <Celebration spec={cheer} fading={cheerFade} />}
        <p className="text-[1.35rem] font-semibold text-jade">{feedback}</p>
        <div className="mt-5 space-y-2.5">
          {lines.map((l) => (
            <div
              key={l.key}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 ${"mine" in l ? "bg-accent-soft" : "bg-paper"}`}
            >
              <div className={`min-w-0 flex-1 ${"mine" in l ? "text-right" : ""}`}>
                <p lang="zh-CN" className="zh text-[1.25rem] font-medium leading-snug">{l.zh}</p>
                <p className="text-[0.95rem] text-muted">{l.pt}</p>
              </div>
              <button
                onClick={() => speak(l.zh)}
                className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full bg-surface/70 text-[1rem]"
                aria-label={`Ouvir ${l.zh}`}
              >
                <span aria-hidden="true">🔊</span>
              </button>
            </div>
          ))}
        </div>
        {targetGloss && (
          <p className="mt-4 text-center text-[1.05rem] text-muted">
            <span lang="zh-CN" className="zh text-[1.3rem] font-semibold text-ink">{targetGloss.w}</span>
            {targetGloss.p ? ` · ${targetGloss.p}` : ""} = {targetGloss.pt}
          </p>
        )}
        <div className="mt-6 space-y-3">
          <BigButton big onClick={() => router.replace("/hoje")}>
            Por hoje é só
          </BigButton>
          <button
            onClick={() => router.push(`/pratica?m=${dialogue.moment}&again=${Date.now()}`)}
            className="w-full min-h-12 py-3 text-center text-[1rem] text-muted underline underline-offset-4"
          >
            Mais uma conversinha
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card onExit={onExit} moment={header}>
      {/* thread — new lines are announced politely to screen readers */}
      <div className="space-y-3" role="log" aria-live="polite" aria-atomic="false" aria-label="Conversa">
        {shown.map((l) =>
          isEita(l) ? (
            <div key={l.key} className="rise flex justify-start">
              <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-paper px-4 py-3">
                {l.py && <p className="py-big text-[1.55rem] leading-snug">{l.py}</p>}
                <WordChips
                  line={l}
                  sel={selWord}
                  onSel={(i) =>
                    setSelWord(
                      selWord && selWord.key === l.key && selWord.i === i
                        ? null
                        : { key: l.key, i }
                    )
                  }
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    onClick={() => speak(l.zh)}
                    className="flex min-h-12 min-w-12 items-center justify-center rounded-full text-[1.05rem] text-muted active:bg-surface"
                    aria-label={`Ouvir ${l.zh}`}
                  >
                    <span aria-hidden="true">🔊</span>
                  </button>
                  <button
                    onClick={() => speak(l.zh, { slow: true })}
                    className="flex min-h-12 min-w-12 items-center justify-center rounded-full text-[1.05rem] text-muted active:bg-surface"
                    aria-label={`Ouvir devagar ${l.zh}`}
                  >
                    <span aria-hidden="true">🐢</span>
                  </button>
                  {voiceAvailable && (
                    <button
                      onClick={() => (rehearse?.key === l.key && rehearse.listening ? stopRehearse() : startRehearse(l))}
                      className={`flex min-h-12 min-w-12 items-center justify-center rounded-full text-[1.05rem] active:bg-surface ${
                        rehearse?.key === l.key && rehearse.listening ? "animate-pulse bg-accent-soft text-accent" : "text-muted"
                      }`}
                      aria-label={`Repetir ${l.zh}`}
                    >
                      <span aria-hidden="true">🎤</span>
                    </button>
                  )}
                  {l.pt && (
                    <button
                      onClick={() =>
                        setShowPt((s) => {
                          const n = new Set(s);
                          if (n.has(l.key)) n.delete(l.key);
                          else n.add(l.key);
                          return n;
                        })
                      }
                      className="min-h-12 rounded-xl px-3 text-[0.95rem] text-muted underline underline-offset-2"
                    >
                      {showPt.has(l.key) ? "Esconder" : "Ver tradução"}
                    </button>
                  )}
                </div>
                {rehearse?.key === l.key && (
                  <p className={`mt-1.5 text-[1rem] font-medium ${rehearse.listening ? "text-muted" : rehearse.good ? "text-jade" : "text-hint"}`}>
                    {rehearse.listening ? "Sua vez — repita a frase…" : rehearse.msg}
                  </p>
                )}
                {showPt.has(l.key) && (
                  <p className="mt-1 text-[1rem] text-muted">{l.pt}</p>
                )}
              </div>
            </div>
          ) : (
            <div key={l.key} className="rise flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-white">
                <p lang="zh-CN" className="zh text-[1.5rem] font-medium leading-snug">{l.zh}</p>
                <p className="mt-0.5 text-[0.95rem] opacity-85">{l.pt}</p>
              </div>
            </div>
          )
        )}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-md bg-paper px-4 py-3 text-muted">
              <span className="inline-flex gap-1" aria-hidden="true">
                <i className="animate-pulse">●</i>
                <i className="animate-pulse [animation-delay:150ms]">●</i>
                <i className="animate-pulse [animation-delay:300ms]">●</i>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* reply area */}
      {learnerTurn && (
        <div ref={replyRef} tabIndex={-1} className="rise mt-5 border-t border-line pt-4 outline-none">
          <div className="flex items-center justify-between">
            <p className="text-[1rem] text-muted">
              {learnerTurn.prompt ?? "Sua resposta:"}
            </p>
            <button
              onClick={help}
              className="min-h-12 rounded-full bg-hint-soft px-5 text-[1rem] font-medium text-hint"
            >
              💡 Me ajude
            </button>
          </div>

          <div aria-live="polite">
            {hintBox && (
              <div className="rise mt-3 rounded-2xl bg-hint-soft p-3.5">
                <p className="text-[0.9rem] font-semibold uppercase tracking-wide text-hint">
                  {hintBox.title}
                </p>
                <p lang="zh-CN" className="zh mt-1 whitespace-pre-line text-[1.15rem]">{hintBox.text}</p>
              </div>
            )}
            {feedback && (
              <p className="rise mt-3 text-[1.05rem] font-medium text-hint">{feedback}</p>
            )}
          </div>

          {/* voice-first reply on choice turns */}
          {learnerTurn.kind === "choice" && speechSupported() && !voiceDead && !typeMode && (
            <div className="mt-4">
              <button
                onClick={listening ? stopListening : startListening}
                className={`pop flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl text-[1.25rem] font-semibold transition active:scale-[0.98] ${
                  listening
                    ? "bg-accent text-white animate-pulse"
                    : "border-2 border-accent bg-accent-soft text-ink"
                }`}
              >
                <span className="text-[1.5rem]" aria-hidden="true">{listening ? "⏹" : "🎤"}</span>
                {listening ? "Ouvindo… toque para parar" : "Falar minha resposta"}
              </button>
              {transcript && (
                <p lang="zh-CN" className="zh mt-2 text-center text-[1.2rem] text-muted" aria-live="polite">{transcript}</p>
              )}
              <p className="mt-2 text-center text-[0.9rem] text-muted">
                ou toque numa resposta abaixo
              </p>
            </div>
          )}
          {learnerTurn.kind === "choice" && !speechSupported() && (
            <p className="mt-3 text-center text-[0.95rem] text-muted">
              O microfone não funciona neste navegador — toque nas respostas.
            </p>
          )}
          {learnerTurn.kind === "choice" && speechSupported() && voiceDead && (
            <p className="mt-3 text-center text-[0.95rem] text-muted">
              O reconhecimento de voz está instável agora — toque nas respostas.
            </p>
          )}

          {/* what the recognizer heard vs the closest reply — misses stay legible */}
          {lastVoice && (
            <div className="rise mt-3 rounded-2xl bg-paper p-3.5">
              <p className="text-[0.9rem] font-semibold uppercase tracking-wide text-muted">Você disse</p>
              <p lang="zh-CN" className="zh mt-0.5 text-[1.15rem]">{lastVoice.heard}</p>
              {lastVoice.closest && (
                <>
                  <p className="mt-2 text-[0.9rem] font-semibold uppercase tracking-wide text-muted">Mais perto de</p>
                  {lastVoice.closest.py && <p className="py-big mt-0.5 text-[1.05rem]">{lastVoice.closest.py}</p>}
                  <p lang="zh-CN" className="zh text-[1.15rem] font-medium">{lastVoice.closest.zh}</p>
                  <p className="text-[0.95rem] text-muted">{lastVoice.closest.pt}</p>
                </>
              )}
              {voiceClip && (
                <button
                  onClick={() => new Audio(voiceClip).play()}
                  className="mt-2 min-h-11 rounded-xl bg-surface px-4 text-[0.95rem] text-muted"
                >
                  🔉 Ouça minha voz
                </button>
              )}
            </div>
          )}

          {!typeMode ? (
            <div className="mt-3 grid gap-2.5">
              {visibleReplies.map((r) => {
                const i = learnerTurn.replies.indexOf(r);
                const reveal = i === revealIdx;
                return (
                  <button
                    key={r.zh}
                    onClick={() => pickReply(r, i)}
                    className={`pop min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.98] ${
                      reveal
                        ? "border-jade bg-jade-soft"
                        : "border-line bg-surface active:border-accent/50"
                    }`}
                  >
                    {learnerTurn.kind === "check" ? (
                      <span className="text-[1.2rem]">{r.pt}</span>
                    ) : (
                      <>
                        <span className="py-big block text-[1.35rem] leading-snug">
                          {r.py}
                        </span>
                        <span lang="zh-CN" className="zh block text-[1.3rem] font-medium leading-snug">
                          {r.zh}
                        </span>
                        <span className="block text-[0.95rem] text-muted">
                          {r.pt}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              <div className="mt-1 flex items-center justify-between">
                <button
                  onClick={() => setTypeMode(true)}
                  className="min-h-12 rounded-xl px-3 text-[1rem] text-muted underline underline-offset-4"
                >
                  Prefiro escrever
                </button>
                {learnerTurn.kind === "choice" && (
                  <button
                    onClick={revealAndAdvance}
                    className="min-h-12 rounded-xl px-3 text-[1rem] text-muted underline underline-offset-4"
                  >
                    Não sei ainda
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && typed.trim() && checkTyped()}
                placeholder="Escreva em chinês ou pinyin…"
                lang="zh-CN"
                autoCapitalize="off"
                autoCorrect="off"
                autoFocus
                className="zh w-full rounded-2xl border-2 border-line bg-surface px-5 py-4 text-[1.4rem] outline-none focus:border-accent"
              />
              <div className="mt-3 flex gap-3">
                <BigButton variant="ghost" onClick={() => setTypeMode(false)}>
                  Ver respostas
                </BigButton>
                <BigButton big disabled={!typed.trim()} onClick={checkTyped}>
                  Enviar
                </BigButton>
              </div>
            </div>
          )}
        </div>
      )}
      <div ref={bottomRef} />
    </Card>
  );
}

function Card({
  children,
  onExit,
  moment,
}: {
  children: React.ReactNode;
  onExit: () => void;
  moment: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="min-h-11 rounded-full px-4 py-2.5 text-[1.05rem] text-muted active:bg-line"
        >
          ← voltar
        </button>
        <p className="text-[1rem] text-muted">{moment}</p>
      </div>
      <div className="rise relative mt-5 flex-1 overflow-hidden rounded-3xl bg-surface p-5 shadow-[0_6px_30px_rgba(60,40,20,0.08)]">
        {children}
      </div>
    </div>
  );
}

// ---------- word chips: every word separated, colored by type, tap for the definition

const POS_STYLE: Record<string, { fg: string; bg: string; label: string }> = {
  substantivo: { fg: "text-accent-deep", bg: "bg-accent-soft", label: "substantivo" },
  verbo: { fg: "text-jade", bg: "bg-jade-soft", label: "verbo" },
  pronome: { fg: "text-[#2f5f8f]", bg: "bg-[#e4edf6]", label: "pronome" },
  numeral: { fg: "text-[#7a5195]", bg: "bg-[#f0e8f6]", label: "numeral" },
  classificador: { fg: "text-[#7a5195]", bg: "bg-[#f0e8f6]", label: "classificador" },
  "numeral-classificador": { fg: "text-[#7a5195]", bg: "bg-[#f0e8f6]", label: "numeral" },
  adjetivo: { fg: "text-[#a13e58]", bg: "bg-[#f8e6ec]", label: "adjetivo" },
  "advérbio": { fg: "text-hint", bg: "bg-hint-soft", label: "advérbio" },
  "partícula": { fg: "text-ink", bg: "bg-line", label: "partícula" },
  "preposição": { fg: "text-[#226360]", bg: "bg-[#e2f0ef]", label: "preposição" },
  "conjunção": { fg: "text-[#226360]", bg: "bg-[#e2f0ef]", label: "conjunção" },
  "expressão": { fg: "text-accent-deep", bg: "bg-accent-soft", label: "expressão" },
};
const POS_DEFAULT = { fg: "text-ink", bg: "bg-surface", label: "" };

function WordChips({
  line,
  sel,
  onSel,
}: {
  line: Rendered;
  sel: { key: string; i: number } | null;
  onSel: (i: number) => void;
}) {
  const glosses = glossesFor(line.words ?? []);
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-end gap-x-1.5 gap-y-1.5">
        {glosses.map((g, i) => {
          const st = POS_STYLE[vocabById.get(`v:${g.w}`)?.pos ?? ""] ?? POS_DEFAULT;
          const short = (g.pt || "").split(/[;,]/)[0].trim();
          return (
            <button
              key={i}
              onClick={() => onSel(i)}
              aria-label={`${g.w} — significado`}
              className={`flex min-h-12 min-w-12 flex-col items-center justify-center rounded-lg px-2 pb-1 pt-1.5 ${st.bg} ${
                sel?.key === line.key && sel.i === i
                  ? "ring-2 ring-accent"
                  : ""
              }`}
            >
              <span lang="zh-CN" className={`zh text-[1.35rem] font-semibold leading-tight ${st.fg}`}>
                {g.w}
              </span>
              {short && (
                <span className="max-w-20 truncate text-[0.75rem] leading-tight text-muted">
                  {short}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {sel?.key === line.key && glosses[sel.i] && (
        <div className="rise mt-2 rounded-xl border border-line bg-surface px-3 py-2 text-[0.95rem]">
          <span lang="zh-CN" className="zh font-semibold">{glosses[sel.i].w}</span>
          {glosses[sel.i].p && <span className="py-big ml-1.5">{glosses[sel.i].p}</span>}
          <span className="ml-1.5">= {glosses[sel.i].pt || "—"}</span>
          {(POS_STYLE[vocabById.get(`v:${glosses[sel.i].w}`)?.pos ?? ""]?.label ?? "") && (
            <span className="ml-1.5 rounded-full bg-paper px-2 py-0.5 text-[0.75rem] text-muted">
              {POS_STYLE[vocabById.get(`v:${glosses[sel.i].w}`)?.pos ?? ""]!.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
