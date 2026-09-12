"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BigButton from "@/components/BigButton";
import { MOMENTS, TOPICS } from "@/lib/engine";
import { useLearner } from "@/lib/store";
import type { LevelId, MomentSetting, SelfConfidence, TopicId } from "@/lib/types";

const LEVELS: { id: LevelId; title: string; sub: string }[] = [
  { id: "beginner", title: "Estou começando", sub: "Conheço poucas palavras." },
  { id: "some", title: "Já sei um pouco", sub: "Consigo entender algumas frases simples." },
  { id: "hsk1", title: "Estudei aproximadamente HSK 1", sub: "" },
  { id: "hsk2", title: "Estudei aproximadamente HSK 2", sub: "" },
];

const CONFIDENCE: { id: SelfConfidence; label: string }[] = [
  { id: "low", label: "Ainda fico inseguro(a)" },
  { id: "medium", label: "Depende da situação" },
  { id: "high", label: "Já consigo falar algumas coisas" },
];

const STEPS = 5;

export default function Onboarding() {
  const router = useRouter();
  const { startProfile } = useLearner();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<LevelId | null>(null);
  const [interests, setInterests] = useState<TopicId[]>([]);
  const [moments, setMoments] = useState<MomentSetting[]>(
    MOMENTS.map((m) => ({ id: m.id, time: m.defaultTime, enabled: true }))
  );
  const [confidence, setConfidence] = useState<SelfConfidence | null>(null);

  const canNext =
    step === 0
      ? name.trim().length > 0
      : step === 1
        ? level !== null
        : step === 2
          ? interests.length >= 3 && interests.length <= 5
          : step === 3
            ? moments.some((m) => m.enabled)
            : confidence !== null;

  function finish() {
    if (!level || !confidence) return;
    startProfile({
      name: name.trim(),
      level,
      interests,
      moments,
      selfConfidence: confidence,
      createdAt: Date.now(),
    });
    router.replace("/hoje");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8">
      {/* progress dots */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: STEPS }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 rounded-full transition-all ${
              i === step ? "w-8 bg-accent" : i < step ? "w-2.5 bg-accent/50" : "w-2.5 bg-line"
            }`}
          />
        ))}
      </div>

      <div className="rise mt-10 flex-1" key={step}>
        {step === 0 && (
          <>
            <h1 className="text-[2.4rem] font-bold leading-tight">
              Chinês que cabe no seu dia.
            </h1>
            <p className="mt-4 text-[1.25rem] leading-relaxed text-muted">
              Para quem já aprendeu um pouco e quer manter o chinês vivo.
              <br />
              Conversinhas na hora certa — antes dos seus compromissos.
            </p>
            <label className="mt-10 block text-[1.1rem] font-medium">
              Como podemos te chamar?
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoCapitalize="words"
                className="mt-2 w-full rounded-2xl border-2 border-line bg-surface px-5 py-4 text-[1.3rem] outline-none focus:border-accent"
              />
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-[2rem] font-bold leading-tight">
              Quanto chinês você já conhece?
            </h1>
            <div className="mt-8 grid gap-3">
              {LEVELS.map((l) => (
                <SelectCard
                  key={l.id}
                  active={level === l.id}
                  onClick={() => setLevel(l.id)}
                  title={l.title}
                  sub={l.sub}
                />
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-[2rem] font-bold leading-tight">
              Sobre o que você gosta de conversar?
            </h1>
            <p className="mt-2 text-[1.1rem] text-muted">
              Escolha de 3 a 5 assuntos.{" "}
              <span className="font-semibold text-ink">{interests.length} escolhidos</span>
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {TOPICS.map((t) => {
                const on = interests.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      setInterests((prev) =>
                        on
                          ? prev.filter((x) => x !== t.id)
                          : prev.length < 5
                            ? [...prev, t.id]
                            : prev
                      )
                    }
                    className={`min-h-16 rounded-2xl border-2 px-4 py-3 text-left text-[1.15rem] font-medium transition active:scale-[0.97] ${
                      on ? "border-accent bg-accent-soft" : "border-line bg-surface"
                    }`}
                  >
                    <span className="mr-1.5">{t.emoji}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-[2rem] font-bold leading-tight">
              Em quais momentos podemos praticar juntos?
            </h1>
            <p className="mt-2 text-[1.1rem] text-muted">
              Cada prática dura menos de um minuto.
            </p>
            <div className="mt-8 grid gap-3">
              {moments.map((m, i) => {
                const meta = MOMENTS.find((x) => x.id === m.id)!;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between rounded-2xl border-2 px-5 py-4 ${
                      m.enabled ? "border-accent bg-accent-soft" : "border-line bg-surface"
                    }`}
                  >
                    <button
                      className="flex items-center gap-3 text-left"
                      onClick={() =>
                        setMoments((ms) =>
                          ms.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x))
                        )
                      }
                    >
                      <span className="text-[1.6rem]">{meta.emoji}</span>
                      <span>
                        <span className="block text-[1.2rem] font-semibold">{meta.label}</span>
                        <span className="text-[1rem] text-muted">{meta.hint}</span>
                      </span>
                    </button>
                    <input
                      type="time"
                      value={m.time}
                      disabled={!m.enabled}
                      onChange={(e) =>
                        setMoments((ms) =>
                          ms.map((x, j) => (j === i ? { ...x, time: e.target.value } : x))
                        )
                      }
                      className="rounded-xl border border-line bg-surface px-2.5 py-2 text-[1.1rem] disabled:opacity-40"
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-[2rem] font-bold leading-tight">
              Como você se sente falando chinês hoje?
            </h1>
            <div className="mt-8 grid gap-3">
              {CONFIDENCE.map((c) => (
                <SelectCard
                  key={c.id}
                  active={confidence === c.id}
                  onClick={() => setConfidence(c.id)}
                  title={c.label}
                />
              ))}
            </div>
            <p className="mt-6 text-[1.05rem] text-muted">
              Sem resposta certa — a gente ajusta o ritmo para você.
            </p>
          </>
        )}
      </div>

      <div className="mt-8">
        {step === 0 ? (
          <BigButton big disabled={!canNext} onClick={() => setStep(1)}>
            Começar
          </BigButton>
        ) : (
          <div className="flex gap-3">
            <BigButton variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Voltar
            </BigButton>
            <BigButton
              big
              disabled={!canNext}
              onClick={() => (step === STEPS - 1 ? finish() : setStep((s) => s + 1))}
            >
              {step === STEPS - 1 ? "Tudo certo!" : "Continuar"}
            </BigButton>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectCard({
  title,
  sub,
  active,
  onClick,
}: {
  title: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-16 w-full rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.98] ${
        active ? "border-accent bg-accent-soft" : "border-line bg-surface"
      }`}
    >
      <span className="block text-[1.25rem] font-semibold">{title}</span>
      {sub ? <span className="text-[1.05rem] text-muted">{sub}</span> : null}
    </button>
  );
}
