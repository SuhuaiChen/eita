"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLearner } from "@/lib/store";
import {
  applyResult,
  pickEventPractice,
  pickPractice,
  type Outcome,
  type Practice,
} from "@/lib/engine";
import { currentMoment } from "@/lib/moments";
import { getAgenda } from "@/lib/calendar";
import { aiDialogueForEvent } from "@/lib/ai";
import { takePractice } from "@/lib/sessionCache";
import DialogueRunner from "@/components/DialogueRunner";
import type { MomentId } from "@/lib/types";

function PraticaInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, update, ready } = useLearner();

  const eventId = params.get("e");
  const moment =
    (params.get("m") as MomentId) ??
    (state?.profile ? (currentMoment(state.profile.moments)?.id ?? "cafe") : "cafe");
  const round = Number(params.get("r") ?? 1);
  const again = params.get("again");

  const [asyncPractice, setAsyncPractice] = useState<Practice | null>(null);
  const [pending, setPending] = useState(!!eventId);
  const started = useRef(false);

  // event practice: resolve agenda item → try AI-personalized dialogue →
  // fall back to the engine's scripted/generated pick
  useEffect(() => {
    if (!eventId || !state?.profile || started.current) return;
    started.current = true;
    let dead = false;
    (async () => {
      const { items } = await getAgenda(state.profile!, new Date());
      const ev = items.find((i) => i.id === eventId);
      if (!ev) {
        if (!dead) setPending(false);
        return;
      }
      const fallback = pickEventPractice(state, ev);
      const ai = await aiDialogueForEvent(state, ev);
      if (dead) return;
      if (ai) {
        setAsyncPractice({
          dialogue: ai,
          target: ai.targets[0] ?? fallback?.target ?? "v:你好",
          previewZh: ai.turns[0].role === "eita" ? ai.turns[0].zh : "",
          previewPy: ai.turns[0].role === "eita" ? ai.turns[0].py : "",
          recovery: false,
          isNew: false,
          eventTitle: ev.title,
        });
      } else if (fallback) {
        setAsyncPractice(fallback);
      }
      setPending(false);
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, state?.profile]);

  const practice: Practice | null = useMemo(() => {
    if (eventId) return asyncPractice;
    if (!state) return null;
    return takePractice(moment) ?? pickPractice(state, moment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, moment, again, eventId, asyncPractice]);

  if (!ready || !state) return null;

  if (pending) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl">🐧</p>
        <p className="mt-4 text-xl text-muted">
          Eita está preparando uma conversa pra você…
        </p>
      </div>
    );
  }

  if (!practice) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="mt-4 text-2xl font-bold">Tudo em dia!</h1>
        <p className="mt-2 text-muted">
          Não temos nada novo agora. A gente te chama no próximo momento.
        </p>
        <button
          onClick={() => router.push("/hoje")}
          className="mt-8 min-h-14 rounded-2xl bg-accent px-8 text-xl font-semibold text-white"
        >
          Voltar para Hoje
        </button>
      </div>
    );
  }

  return (
    <DialogueRunner
      key={`${moment}:${round}:${practice.target}:${practice.dialogue.id}:${again ?? ""}`}
      dialogue={practice.dialogue}
      recovery={practice.recovery}
      context={practice.eventTitle}
      learnerName={state.profile?.name}
      onFinish={(outcome: Outcome, helpLevel: number) =>
        update((s) =>
          applyResult(
            s,
            { target: practice.target, moment: practice.dialogue.moment, dialogueId: practice.dialogue.id },
            outcome,
            helpLevel
          )
        )
      }
      onExit={() => router.push("/hoje")}
    />
  );
}

export default function PraticaPage() {
  return (
    <Suspense>
      <PraticaInner />
    </Suspense>
  );
}
