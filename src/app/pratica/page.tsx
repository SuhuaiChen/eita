"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLearner } from "@/lib/store";
import {
  applyResult,
  MOMENTS,
  pickEventPractice,
  pickPractice,
  type Outcome,
  type Practice,
} from "@/lib/engine";
import { currentMoment } from "@/lib/moments";
import { getAgenda } from "@/lib/calendar";
import { aiDialogueForEvent } from "@/lib/ai";
import { takePractice } from "@/lib/sessionCache";
import DialogueRunner, {
  RESUME_THREAD_KEY,
  type ResumeThread,
} from "@/components/DialogueRunner";
import type { MomentId } from "@/lib/types";

const RESUME_PRACTICE_KEY = "eita:resumePractice";
const RESUME_MAX_AGE = 30 * 60_000;

interface ResumePractice {
  at: number;
  practice: Practice;
}

function readResume(): { practice: Practice; thread?: ResumeThread } | null {
  try {
    const raw = sessionStorage.getItem(RESUME_PRACTICE_KEY);
    if (!raw) return null;
    const rp = JSON.parse(raw) as ResumePractice;
    if (Date.now() - rp.at > RESUME_MAX_AGE) return null;
    const tr = sessionStorage.getItem(RESUME_THREAD_KEY);
    const thread = tr ? (JSON.parse(tr) as ResumeThread) : undefined;
    return {
      practice: rp.practice,
      thread: thread?.dialogueId === rp.practice.dialogue.id ? thread : undefined,
    };
  } catch {
    return null;
  }
}

function clearResume() {
  try {
    sessionStorage.removeItem(RESUME_PRACTICE_KEY);
    sessionStorage.removeItem(RESUME_THREAD_KEY);
  } catch {}
}

function PraticaInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, update, ready } = useLearner();

  const eventId = params.get("e");
  const rawM = params.get("m");
  const moment: MomentId =
    rawM && MOMENTS.some((x) => x.id === rawM)
      ? (rawM as MomentId)
      : state?.profile
        ? (currentMoment(state.profile.moments)?.id ?? "cafe")
        : "cafe";
  const again = params.get("again");

  const [practice, setPractice] = useState<Practice | null>(null);
  const [resumeThread, setResumeThread] = useState<ResumeThread | undefined>(undefined);
  const [pending, setPending] = useState(!!eventId);
  const [missingEvent, setMissingEvent] = useState(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const hasProfile = !!state?.profile;

  useEffect(() => {
    if (ready && !hasProfile) router.replace("/onboarding");
  }, [ready, hasProfile, router]);

  // the practice is resolved once per visit — a state update from onFinish
  // must never re-roll it (that used to unmount the runner mid-recap and
  // silently chain a new dialogue). `?again=` is the only sanctioned re-roll.
  useEffect(() => {
    if (eventId || !ready || !hasProfile) return;
    const s = stateRef.current;
    queueMicrotask(() => {
      // an in-flight dialogue wins over everything — resume where we left off
      const rs = readResume();
      if (rs && (!rawM || rs.practice.dialogue.moment === moment) && !again) {
        setPractice(rs.practice);
        setResumeThread(rs.thread);
        return;
      }
      const p = s ? (takePractice(moment) ?? pickPractice(s, moment)) : null;
      setPractice(p);
      setResumeThread(undefined);
      try {
        if (p) sessionStorage.setItem(RESUME_PRACTICE_KEY, JSON.stringify({ at: Date.now(), practice: p }));
        else sessionStorage.removeItem(RESUME_PRACTICE_KEY);
      } catch {}
    });
  }, [ready, hasProfile, eventId, moment, again, rawM]);

  // event practice: resolve agenda item → try AI-personalized dialogue →
  // fall back to the engine's scripted/generated pick
  useEffect(() => {
    if (!eventId || !ready || !hasProfile) return;
    let dead = false;
    (async () => {
      try {
        const { items } = await getAgenda(stateRef.current!.profile!, new Date());
        const ev = items.find((i) => i.id === eventId);
        if (!ev) {
          if (!dead) {
            setMissingEvent(true);
            setPending(false);
          }
          return;
        }
        const fallback = pickEventPractice(stateRef.current!, ev);
        // AI personalizes upcoming events; a past event gets the scripted
        // practice instead ("how was it" prompts would need different copy)
        const past = ev.start.getTime() < Date.now() - 15 * 60_000;
        const ai = past ? null : await aiDialogueForEvent(stateRef.current!, ev);
        if (dead) return;
        if (ai) {
          setPractice({
            dialogue: ai,
            target: ai.targets[0] ?? fallback?.target ?? "v:你好",
            previewZh: ai.turns[0].role === "eita" ? ai.turns[0].zh : "",
            previewPy: ai.turns[0].role === "eita" ? ai.turns[0].py : "",
            recovery: false,
            isNew: fallback?.isNew ?? false,
            eventTitle: ev.title,
          });
        } else if (fallback) {
          setPractice(fallback);
        }
      } catch {
        if (!dead) {
          setMissingEvent(true);
        }
      } finally {
        if (!dead) setPending(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [eventId, ready, hasProfile]);

  if (!ready || !state) return null;

  if (pending) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl" aria-hidden="true">🐧</p>
        <p className="mt-4 text-xl text-muted">
          Eita está preparando uma conversa pra você…
        </p>
      </div>
    );
  }

  if (missingEvent) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl" aria-hidden="true">📅</p>
        <h1 className="mt-4 text-2xl font-bold">Esse compromisso já passou</h1>
        <p className="mt-2 text-muted">
          Sem problema — agendas mudam. Que tal uma conversinha do momento?
        </p>
        <button
          onClick={() => router.replace("/hoje")}
          className="mt-8 min-h-14 rounded-2xl bg-accent px-8 text-xl font-semibold text-white"
        >
          Voltar para Hoje
        </button>
      </div>
    );
  }

  if (!practice) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl" aria-hidden="true">🎉</p>
        <h1 className="mt-4 text-2xl font-bold">Tudo em dia!</h1>
        <p className="mt-2 text-muted">
          Não temos nada novo agora. A gente te chama no próximo momento.
        </p>
        <button
          onClick={() => router.replace("/hoje")}
          className="mt-8 min-h-14 rounded-2xl bg-accent px-8 text-xl font-semibold text-white"
        >
          Voltar para Hoje
        </button>
      </div>
    );
  }

  return (
    <DialogueRunner
      key={`${moment}:${practice.target}:${practice.dialogue.id}:${again ?? ""}`}
      dialogue={practice.dialogue}
      recovery={practice.recovery}
      context={practice.eventTitle}
      learnerName={state.profile?.name}
      resume={resumeThread}
      onFinish={(outcome: Outcome, helpLevel: number, voiceTurns: number, tapTurns: number) => {
        clearResume();
        update((s) =>
          applyResult(
            s,
            {
              target: practice.target,
              moment: practice.dialogue.moment,
              dialogueId: practice.dialogue.id,
              voiceTurns,
              tapTurns,
            },
            outcome,
            helpLevel
          )
        );
      }}
      onExit={() => {
        // leaving mid-dialogue keeps the resume snapshot — that's the point;
        // finishing is what clears it
        router.replace("/hoje");
      }}
    />
  );
}

export default function PraticaPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
          <p className="text-5xl" aria-hidden="true">🐧</p>
        </div>
      }
    >
      <PraticaInner />
    </Suspense>
  );
}
