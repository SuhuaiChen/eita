"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import BigButton from "@/components/BigButton";
import { useLearner } from "@/lib/store";
import { MOMENTS, TOPICS } from "@/lib/engine";
import {
  gcalConnectUrl,
  gcalConsumeRedirect,
  gcalDisconnect,
  gcalLinked,
  googleConfigured,
} from "@/lib/calendar";
import type { LevelId, SelfConfidence } from "@/lib/types";
import { loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import { authEnabled, sendMagicLink, signOut } from "@/lib/auth";
import { track } from "@/lib/telemetry";
import {
  notificationsSupported,
  remindersOn,
  enableReminders,
  disableReminders,
} from "@/lib/reminders";

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
  const { state, ready, update, reset, userEmail } = useLearner();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [gcal, setGcal] = useState<"off" | "on">("off");
  const [prefs, setPrefs] = useState<Prefs>({ fontSize: "normal", highContrast: false });
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState<null | "sent" | "err" | "expired">(null);
  const [remind, setRemind] = useState(false);

  useEffect(() => {
    if (ready && !state.profile) router.replace("/onboarding");
    // returning from Google's OAuth redirect?
    queueMicrotask(async () => {
      const back = await gcalConsumeRedirect();
      setGcal(back || gcalLinked() ? "on" : "off");
      if (back) track("gcal.connected");
      setPrefs(loadPrefs());
      setRemind(remindersOn());
      // a magic link that landed expired/used arrives as #error=… — the SDK
      // swallows it, so surface it ourselves in warm copy
      if (window.location.hash.includes("error")) {
        const hp = new URLSearchParams(window.location.hash.slice(1));
        if (hp.get("error_code") || hp.get("error")) setLinkSent("expired");
        history.replaceState(null, "", window.location.pathname);
      }
    });
  }, [ready, state.profile, router]);

  const setPref = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

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

      {authEnabled() && (
        <section className="mt-6">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Sua conta
          </p>
          <div className="mt-3 rounded-2xl border-2 border-line bg-surface px-5 py-4">
            {userEmail ? (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[1.05rem]">
                  <span aria-hidden="true">✉️ </span>
                  <span className="font-medium">{userEmail}</span>
                  <span className="block text-[0.9rem] text-muted">
                    Seu progresso está salvo na sua conta.
                  </span>
                </p>
                <button
                  onClick={() => signOut()}
                  className="min-h-11 shrink-0 px-3 text-[0.95rem] text-muted underline underline-offset-4"
                >
                  Sair
                </button>
              </div>
            ) : linkSent === "sent" ? (
              <p className="text-[1.05rem]">
                <span aria-hidden="true">📬 </span>
                Enviamos um link para <b>{email}</b> — abra o e-mail neste aparelho e toque no link.
              </p>
            ) : (
              <>
                <p className="text-[1.05rem] text-muted">
                  Entre com seu e-mail para guardar o progresso na sua conta — útil se trocar de aparelho.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    aria-label="Seu e-mail"
                    className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-3 text-[1.15rem] outline-none focus:border-accent"
                  />
                  <BigButton
                    className="!w-auto shrink-0 px-5"
                    disabled={!/^\S+@\S+\.\S+$/.test(email)}
                    onClick={async () => {
                      try {
                        const err = await sendMagicLink(email.trim());
                        setLinkSent(err ? "err" : "sent");
                      } catch {
                        setLinkSent("err");
                      }
                    }}
                  >
                    Entrar
                  </BigButton>
                </div>
                {linkSent === "err" && (
                  <p className="mt-2 text-[0.95rem] text-hint">
                    Não conseguimos enviar o link — confira o e-mail e tente de novo.
                  </p>
                )}
                {linkSent === "expired" && (
                  <p className="mt-2 text-[0.95rem] text-hint">
                    Esse link expirou — peça um novo aqui embaixo.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <section className="mt-6">
        <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
          Aparência
        </p>
        <div className="mt-3 space-y-2.5">
          <button
            aria-pressed={prefs.fontSize === "grande"}
            onClick={() => setPref({ fontSize: prefs.fontSize === "grande" ? "normal" : "grande" })}
            className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-5 py-3.5 text-left ${
              prefs.fontSize === "grande" ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            <span className="text-[1.15rem] font-medium">🔍 Texto maior</span>
            <span className="text-[0.95rem] text-muted">
              {prefs.fontSize === "grande" ? "ligado" : "desligado"}
            </span>
          </button>
          <button
            aria-pressed={prefs.highContrast}
            onClick={() => setPref({ highContrast: !prefs.highContrast })}
            className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-5 py-3.5 text-left ${
              prefs.highContrast ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            <span className="text-[1.15rem] font-medium">◐ Alto contraste</span>
            <span className="text-[0.95rem] text-muted">
              {prefs.highContrast ? "ligado" : "desligado"}
            </span>
          </button>
        </div>
      </section>

      {notificationsSupported() && (
        <section className="mt-6">
          <p className="text-[1.05rem] font-semibold uppercase tracking-wide text-muted">
            Lembretes
          </p>
          <div className="mt-3 space-y-2.5">
            <button
              aria-pressed={remind}
              onClick={async () => {
                if (remind) {
                  disableReminders();
                  setRemind(false);
                } else {
                  const ok = await enableReminders();
                  setRemind(ok);
                }
              }}
              className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-5 py-3.5 text-left ${
                remind ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <span className="text-[1.15rem] font-medium">🔔 Avisar na hora</span>
              <span className="text-[0.95rem] text-muted">{remind ? "ligado" : "desligado"}</span>
            </button>
            <p className="px-1 text-[0.9rem] text-muted">
              Avisa quando chega a hora de uma conversinha, enquanto o app estiver
              aberto no aparelho. Sem e-mails nem mensagens.
            </p>
            {!remind && Notification.permission === "denied" && (
              <p className="px-1 text-[0.9rem] text-hint">
                O navegador bloqueou os avisos — para ligar, permita notificações
                nas configurações do aparelho e volte aqui.
              </p>
            )}
          </div>
        </section>
      )}

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
                  track("gcal.disconnect");
                  setGcal("off");
                }}
                className="min-h-11 px-3 text-[0.95rem] text-muted underline underline-offset-4"
              >
                Desconectar
              </button>
            </div>
          ) : googleConfigured() ? (
            <button
              onClick={() => {
                track("gcal.connect.start");
                window.location.href = gcalConnectUrl();
              }}
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
          {" · "}
          <Link href="/privacidade" className="underline underline-offset-4">
            Privacidade
          </Link>
        </p>
      </section>
    </Shell>
  );
}
