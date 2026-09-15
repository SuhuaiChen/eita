"use client";

// Warm error boundary — a senior hitting a bug should get a friendly face,
// not the stock error screen.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl" aria-hidden="true">🐧</p>
      <h1 className="mt-4 text-2xl font-bold">Opa — algo saiu do trilho</h1>
      <p className="mt-2 text-muted">
        Acontece. Seu progresso está guardado — vamos tentar de novo?
      </p>
      <button
        onClick={reset}
        className="mt-8 min-h-14 rounded-2xl bg-accent px-8 text-xl font-semibold text-white"
      >
        Tentar de novo
      </button>
      <a
        href="/hoje"
        className="mt-4 flex min-h-12 items-center px-4 text-[1rem] text-muted underline underline-offset-4"
      >
        Voltar para Hoje
      </a>
    </div>
  );
}
