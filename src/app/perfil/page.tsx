"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import BigButton from "@/components/BigButton";
import { useLearner } from "@/lib/store";
import { MOMENTS, TOPICS } from "@/lib/engine";
import {
  gcalConnectUrl,
  gcalConsumeRedirect,
  gcalDisconnect,
  gcalToken,
  googleConfigured,
} from "@/lib/calendar";
import type { LevelId, SelfConfidence } from "@/lib/types";

const LEVEL_LABEL: Record<LevelId, string> = {
  beginner: "Estou começando",
  some: "Já sei um pouco",
  hsk1: "≈ HSK 1",
  hsk2: "≈ HSK 2",
};

const CONFIDENCE: { id: SelfConfidence; label: string }[] = [
  { id: "low", label: "Ainda fico inseguro(a)" },
  { id: "medium", label: "Depende da situação" },
  { id: "high", label: "Já consigo falar algumas coisas" },
];

export default function Perfil() {
  const { state, ready, update, reset } = useLearner();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [gcal, setGcal] = useState<"off" | "on">("off");

  useEffect(() => {
    if (ready && !state.profile) router.replace("/onboarding");
    // returning from Google's OAuth redirect?
    queueMicrotask(() =>
      setGcal(gcalConsumeRedirect() || gcalToken() ? "on" : "off")
    );
  }, [ready, state.profile, router]);

  if (!ready || !state.profile) return null;
  const p = state.profile;

  const setProfile = (patch: Partial<typeof p>) =>
    update((s) => ({ ...s, profile: { ...s.profile!, ...patch } }));

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <h1 className="text-[2rem] font-bold">{p.name}</h1>
        <button
          className="min-h-11 px-3 text-[1rem] text-muted underline underline-offset-4"
          onClick={() => {
            setName(p.name);
            setEditingName(true);
          }}
        >
          Editar
        </button>
      </div>
      {editingName && (
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="words"
            className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-3 text-[1.2rem] outline-none focus:border-accent"
          />
          <BigButton
            className="!w-auto px-5"
            onClick={() => {
              if (name.trim()) setProfile({ name: name.trim() });
              setEditingName(false);
            }}
          >
            Salvar
          </BigButton>
        </div>
      )}

      <section className="mt-7">
        <label className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
          Nível
          <select
            value={p.level}
            onChange={(e) => setProfile({ level: e.target.value as LevelId })}
            className="mt-3 block min-h-14 w-full rounded-2xl border-2 border-line bg-surface px-5 py-4 text-[1.2rem]"
          >
            {Object.entries(LEVEL_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="mt-6">
        <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
          Seus assuntos
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.interests.map((t) => {
            const meta = TOPICS.find((x) => x.id === t)!;
            return (
              <span
                key={t}
                className="rounded-full border-2 border-line bg-surface px-4 py-2 text-[1.05rem]"
              >
                {meta.emoji} {meta.label}
              </span>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
          Seus momentos
        </p>
        <div className="mt-3 space-y-2.5">
          {p.moments.map((m) => {
            const meta = MOMENTS.find((x) => x.id === m.id)!;
            return (
              <div
                key={m.id}
                className={`flex items-center justify-between rounded-2xl border-2 px-5 py-3.5 ${
                  m.enabled ? "border-accent bg-accent-soft" : "border-line bg-surface"
                }`}
              >
                <button
                  className="flex min-h-14 flex-1 items-center gap-3 text-left"
                  aria-pressed={m.enabled}
                  onClick={() =>
                    setProfile({
                      moments: p.moments.map((x) =>
                        x.id === m.id ? { ...x, enabled: !x.enabled } : x
                      ),
                    })
                  }
                >
                  <span className="text-[1.5rem]" aria-hidden="true">{meta.emoji}</span>
                  <span className="text-[1.15rem] font-medium">{meta.label}</span>
                </button>
                <input
                  type="time"
                  value={m.time}
                  disabled={!m.enabled}
                  aria-label={`Horário — ${meta.label}`}
                  onChange={(e) =>
                    setProfile({
                      moments: p.moments.map((x) =>
                        x.id === m.id ? { ...x, time: e.target.value } : x
                      ),
                    })
                  }
                  className="min-h-12 rounded-xl border border-line bg-surface px-2.5 py-2 text-[1.1rem] disabled:opacity-40"
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
          Sua agenda
        </p>
        <div className="mt-3 rounded-2xl border-2 border-line bg-surface px-5 py-4">
          <p className="text-[1.05rem] text-muted">
            O Eita cria uma conversinha ~1 hora antes de cada compromisso.
          </p>
          {gcal === "on" ? (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[1.15rem] font-medium">
                <span aria-hidden="true">📅 </span>Google Agenda conectada
              </p>
              <button
                onClick={() => {
                  gcalDisconnect();
                  setGcal("off");
                }}
                className="min-h-11 px-3 text-[0.95rem] text-muted underline underline-offset-4"
              >
                Desconectar
              </button>
            </div>
          ) : googleConfigured() ? (
            <button
              onClick={() => (window.location.href = gcalConnectUrl())}
              className="pop mt-3 min-h-14 w-full rounded-2xl border-2 border-accent bg-accent-soft px-5 py-3.5 text-[1.15rem] font-semibold active:scale-[0.98]"
            >
              Conectar Google Agenda
            </button>
          ) : (
            <p className="mt-3 text-[1.05rem]">
              <span aria-hidden="true">📅 </span>Por enquanto usamos uma agenda de exemplo
              <span className="block text-[0.9rem] text-muted">
                A conexão com o Google Agenda ainda não está configurada neste aparelho.
              </span>
            </p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
          E hoje, como você se sente?
        </p>
        <div className="mt-3 grid gap-2.5">
          {CONFIDENCE.map((c) => (
            <button
              key={c.id}
              aria-pressed={p.selfConfidence === c.id}
              onClick={() => setProfile({ selfConfidence: c.id })}
              className={`min-h-14 rounded-2xl border-2 px-5 py-3.5 text-left text-[1.15rem] ${
                p.selfConfidence === c.id
                  ? "border-accent bg-accent-soft font-semibold"
                  : "border-line bg-surface"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-6">
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="min-h-11 px-3 text-[1rem] text-muted underline underline-offset-4"
          >
            Recomeçar do zero
          </button>
        ) : (
          <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft p-4">
            <p className="text-[1.05rem]">Apagar todo o seu progresso e começar de novo?</p>
            <div className="mt-3 flex gap-3">
              <BigButton variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancelar
              </BigButton>
              <BigButton
                onClick={() => {
                  gcalDisconnect();
                  reset();
                  router.replace("/onboarding");
                }}
              >
                Sim, recomeçar
              </BigButton>
            </div>
          </div>
        )}
        <p className="mt-6 text-[0.9rem] text-muted">
          Eita · demonstração de hackathon. Currículo: HanFlow HSK 1–2.
        </p>
      </section>
    </Shell>
  );
}
