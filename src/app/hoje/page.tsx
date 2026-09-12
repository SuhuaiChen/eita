"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import BigButton from "@/components/BigButton";
import { useLearner } from "@/lib/store";
import { momentById, pickPractice } from "@/lib/engine";
import { currentMoment, fmtTime } from "@/lib/moments";
import { cachePractice } from "@/lib/sessionCache";
import { getAgenda, isLive, type AgendaItem } from "@/lib/calendar";
import { prefetchEventDialogue } from "@/lib/ai";
import { greeting } from "@/lib/copy";
import { speak } from "@/lib/tts";

export default function Hoje() {
  const { state, ready } = useLearner();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [agenda, setAgenda] = useState<{ items: AgendaItem[]; source: string } | null>(null);

  useEffect(() => {
    if (ready && !state.profile) router.replace("/onboarding");
  }, [ready, state.profile, router]);

  const cm = useMemo(
    () => (state.profile ? currentMoment(state.profile.moments, now) : null),
    [state.profile, now]
  );

  useEffect(() => {
    if (!state.profile) return;
    let dead = false;
    getAgenda(state.profile, now).then((a) => {
      if (dead) return;
      setAgenda(a);
      // start composing the event dialogue in the background so the
      // "Conversar" tap feels instant
      for (const ev of a.items) if (isLive(ev, now)) prefetchEventDialogue(state, ev);
    });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profile, now]);

  // the practice previewed on the card — cached so /pratica runs the same one
  const practice = useMemo(() => {
    if (!state.profile || !cm) return null;
    const p = pickPractice(state, cm.id, now.getTime());
    if (p) cachePractice(cm.id, p);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profile, cm?.id, state.interactions.length]);

  if (!ready || !state.profile) return null;

  const meta = cm ? momentById(cm.id) : null;
  const todayKey = now.toISOString().slice(0, 10);
  const doneToday = state.dailyDone[todayKey]?.length ?? 0;
  const alreadyDid = cm && state.dailyDone[todayKey]?.includes(cm.id);

  return (
    <Shell>
      <h1 className="text-[2.1rem] font-bold">
        {greeting(now.getHours())}, {state.profile.name}.
      </h1>

      {cm && meta && (
        <section className="mt-7">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            {cm.status === "now" ? "Agora" : cm.status === "soon" ? `Em breve · ${fmtTime(cm.at)}` : `Amanhã · ${fmtTime(cm.at)}`}
          </p>
          <div className="rise mt-3 rounded-3xl bg-surface p-6 shadow-[0_6px_30px_rgba(60,40,20,0.08)]">
            <div className="flex items-center gap-3">
              <span className="text-[2rem]">{meta.emoji}</span>
              <div>
                <p className="text-[1.25rem] font-semibold">{meta.label}</p>
                <p className="text-[1rem] text-muted">uma conversinha · ~30 segundos</p>
              </div>
            </div>
            {practice && (
              <div className="mt-5 text-center">
                <p className="zh text-[1.9rem] font-semibold leading-snug">
                  {practice.previewZh}
                </p>
                {practice.previewPy && (
                  <p className="py-big mt-1.5 text-[1.5rem]">{practice.previewPy}</p>
                )}
                {practice.isNew && (
                  <p className="mt-2 inline-block rounded-full bg-hint-soft px-3 py-1 text-[0.9rem] font-medium text-hint">
                    Palavra nova
                  </p>
                )}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              {practice?.previewZh && (
                <BigButton variant="secondary" onClick={() => speak(practice.previewZh)}>
                  🔊 Ouvir
                </BigButton>
              )}
              <BigButton
                big
                onClick={() => router.push(`/pratica?m=${cm.id}`)}
              >
                {alreadyDid ? "Praticar de novo" : "Responder"}
              </BigButton>
            </div>
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Sua agenda hoje
          </p>
          {agenda && (
            <p className="text-[0.85rem] text-muted">
              {agenda.source === "google" ? "Google Agenda" : "demonstração"}
            </p>
          )}
        </div>
        <div className="mt-3 space-y-2.5">
          {agenda?.items.map((ev) => {
            const live = isLive(ev, now);
            const past = ev.start.getTime() + 10 * 60_000 < now.getTime();
            return (
              <div
                key={ev.id}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 ${
                  live
                    ? "border-accent/60 bg-surface shadow-[0_4px_20px_rgba(200,90,30,0.12)]"
                    : past
                      ? "border-line bg-surface/60 opacity-55"
                      : "border-line bg-surface"
                }`}
              >
                <span className="text-[1.5rem]">{ev.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1.15rem] font-medium">{ev.title}</p>
                  <p className="text-[0.95rem] text-muted">{fmtTime(ev.start)}</p>
                </div>
                {live ? (
                  <button
                    onClick={() => router.push(`/pratica?e=${encodeURIComponent(ev.id)}`)}
                    className="pop min-h-12 shrink-0 rounded-2xl bg-accent px-5 text-[1.05rem] font-semibold text-white active:scale-[0.97]"
                  >
                    Conversar
                  </button>
                ) : (
                  !past && (
                    <span className="shrink-0 rounded-full bg-paper px-3 py-1 text-[0.85rem] text-muted">
                      ~1h antes
                    </span>
                  )
                )}
              </div>
            );
          })}
          {agenda && agenda.items.length === 0 && (
            <p className="rounded-2xl border-2 border-dashed border-line px-4 py-5 text-center text-[1rem] text-muted">
              Dia livre na agenda — aproveite os momentos de rotina.
            </p>
          )}
          {!agenda && (
            <p className="px-4 py-4 text-[1rem] text-muted">Carregando agenda…</p>
          )}
        </div>
      </section>

      <p className="mt-8 text-center text-[1rem] text-muted">
        {doneToday === 0
          ? "Uma conversinha por vez. Sem pressa."
          : `Hoje você já conversou ${doneToday} ${doneToday === 1 ? "vez" : "vezes"}.`}
      </p>
    </Shell>
  );
}
