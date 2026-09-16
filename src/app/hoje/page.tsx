"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import BigButton from "@/components/BigButton";
import { useLearner } from "@/lib/store";
import { dayKey, momentById, pickPractice, type Practice } from "@/lib/engine";
import { currentMoment, fmtTime } from "@/lib/moments";
import { cachePractice } from "@/lib/sessionCache";
import { getAgenda, gcalLinked, googleConfigured, isLive, type AgendaItem } from "@/lib/calendar";
import { prefetchEventDialogue } from "@/lib/ai";
import { maybeNotify } from "@/lib/reminders";
import { greeting } from "@/lib/copy";
import { speak } from "@/lib/tts";

const AGENDA_PITCH_KEY = "eita:agendaPitchSeen";
const TIP_KEY = "words"; // tip ids live in state.tipsSeen

export default function Hoje() {
  const { state, ready, update } = useLearner();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [agenda, setAgenda] = useState<{ items: AgendaItem[]; source: string } | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [pitchDismissed, setPitchDismissed] = useState(true);
  const hasProfile = !!state.profile;

  useEffect(() => {
    if (ready && !state.profile) router.replace("/onboarding");
    queueMicrotask(() => {
      try {
        setPitchDismissed(!!localStorage.getItem(AGENDA_PITCH_KEY));
      } catch {}
    });
  }, [ready, state.profile, router]);

  // keep "now" live so Conversar appears/expires and moments roll over while
  // the page stays open
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const cm = useMemo(
    () => (state.profile ? currentMoment(state.profile.moments, now) : null),
    [state.profile, now]
  );

  // opt-in nudge when a moment window opens — only while the app is open
  // (the honest scope of browser notifications without a push server).
  // Don't nudge for a moment already practiced today or while the learner is
  // already looking at the page.
  useEffect(() => {
    if (
      cm?.status === "now" &&
      state.profile &&
      !state.dailyDone[dayKey(now)]?.includes(cm.id) &&
      document.visibilityState !== "visible"
    )
      maybeNotify(momentById(cm.id)?.label ?? "", cm.id, dayKey(now));
  }, [cm, state.profile, state.dailyDone, now]);

  // refetch the agenda at most every ~2min (ticks alone shouldn't hammer the
  // Google API), not on every render
  const agendaKey = Math.floor(now.getTime() / 120_000);
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
  }, [hasProfile, agendaKey]);

  // the practice previewed on the card — cached so /pratica runs the same one
  useEffect(() => {
    if (!state.profile || !cm) return;
    const p = pickPractice(state, cm.id, now.getTime());
    if (p) cachePractice(cm.id, p);
    queueMicrotask(() => setPractice(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile, cm?.id, state.interactions.length]);

  if (!ready || !state.profile) return null;

  const meta = cm ? momentById(cm.id) : null;
  const todayKey = dayKey(now);
  const doneToday = state.dailyDone[todayKey]?.length ?? 0;
  const alreadyDid = cm && state.dailyDone[todayKey]?.includes(cm.id);
  const showTip = !(state.tipsSeen ?? []).includes(TIP_KEY);
  const showAgendaPitch = googleConfigured() && !gcalLinked() && !pitchDismissed;

  const dismissTip = () =>
    update((s) => ({ ...s, tipsSeen: [...(s.tipsSeen ?? []), TIP_KEY] }));

  const dismissPitch = () => {
    try {
      localStorage.setItem(AGENDA_PITCH_KEY, "1");
    } catch {}
    setPitchDismissed(true);
  };

  return (
    <Shell>
      <h1 className="text-[2.1rem] font-bold">
        {greeting(now.getHours())}, {state.profile.name}.
      </h1>

      {showTip && (
        <div className="rise mt-5 flex items-start justify-between gap-3 rounded-2xl bg-jade-soft px-4 py-3.5">
          <p className="text-[1rem] leading-snug text-jade">
            💡 Dica: numa conversinha, toque em qualquer palavra em chinês para
            ver o que ela significa — e fale sua resposta em vez de tocar.
          </p>
          <button
            onClick={dismissTip}
            aria-label="Dispensar dica"
            className="min-h-11 min-w-11 shrink-0 text-[1.1rem] text-jade"
          >
            ✕
          </button>
        </div>
      )}

      {cm && meta && (
        <section className="mt-7">
          <h2 className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            {cm.status === "now" ? "Agora" : cm.status === "soon" ? `Em breve · ${fmtTime(cm.at)}` : `Amanhã · ${fmtTime(cm.at)}`}
          </h2>
          <div className="rise mt-3 rounded-3xl bg-surface p-6 shadow-[0_6px_30px_rgba(60,40,20,0.08)]">
            <div className="flex items-center gap-3">
              <span className="text-[2rem]" aria-hidden="true">{meta.emoji}</span>
              <div>
                <p className="text-[1.25rem] font-semibold">{meta.label}</p>
                <p className="text-[1rem] text-muted">uma conversinha · ~30 segundos</p>
              </div>
            </div>
            {practice && (
              <div className="mt-5 text-center">
                <p lang="zh-CN" className="zh text-[1.9rem] font-semibold leading-snug">
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
                {alreadyDid ? "Conversar de novo" : "Conversar"}
              </BigButton>
            </div>
            {cm.status !== "now" && (
              <p className="mt-3 text-center text-[0.95rem] text-muted">
                ou{" "}
                <button
                  onClick={() => router.push(`/pratica?m=${cm.id}`)}
                  className="underline underline-offset-4"
                >
                  converse agora mesmo
                </button>
                {" "}— sem esperar a hora.
              </p>
            )}
          </div>
        </section>
      )}

      {showAgendaPitch && (
        <div className="rise mt-6 rounded-2xl border-2 border-accent/40 bg-accent-soft p-4">
          <p className="text-[1.05rem] font-medium">
            <span aria-hidden="true">📅 </span>
            Quer conversinhas antes dos seus compromissos?
          </p>
          <p className="mt-1 text-[0.95rem] text-muted">
            Conecte o Google Agenda e o Eita prepara uma prática para cada
            compromisso do seu dia.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => router.push("/perfil")}
              className="min-h-12 rounded-xl bg-accent px-5 text-[1rem] font-semibold text-white"
            >
              Conectar agenda
            </button>
            <button
              onClick={dismissPitch}
              className="min-h-12 px-3 text-[0.95rem] text-muted underline underline-offset-4"
            >
              Agora não
            </button>
          </div>
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Sua agenda hoje
          </h2>
          {agenda && (
            <p className="text-[0.85rem] text-muted">
              {agenda.source === "google" ? "Google Agenda" : "agenda de exemplo"}
            </p>
          )}
        </div>
        <div className="mt-3 space-y-2.5">
          {agenda?.items.map((ev) => {
            const live = isLive(ev, now);
            const past = ev.start.getTime() + 10 * 60_000 < now.getTime();
            // a just-ended event can still warm up a "como foi?" chat
            const recentPast =
              past && now.getTime() - ev.start.getTime() < 3 * 60 * 60_000;
            return (
              <div
                key={ev.id}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 ${
                  live
                    ? "border-accent/60 bg-surface shadow-[0_4px_20px_rgba(200,90,30,0.12)]"
                    : past
                      ? "border-line bg-surface/60 opacity-70"
                      : "border-line bg-surface"
                }`}
              >
                <span className="text-[1.5rem]" aria-hidden="true">{ev.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1.15rem] font-medium">{ev.title}</p>
                  <p className="text-[0.95rem] text-muted">{fmtTime(ev.start)}</p>
                </div>
                {live ? (
                  <button
                    onClick={() => router.push(`/pratica?e=${encodeURIComponent(ev.id)}`)}
                    className="pop min-h-14 shrink-0 rounded-2xl bg-accent px-5 text-[1.05rem] font-semibold text-white active:scale-[0.97]"
                  >
                    Conversar
                  </button>
                ) : recentPast ? (
                  <button
                    onClick={() => router.push(`/pratica?e=${encodeURIComponent(ev.id)}`)}
                    className="min-h-12 shrink-0 rounded-2xl border-2 border-line bg-surface px-4 text-[0.95rem] font-medium text-muted"
                  >
                    Como foi?
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
