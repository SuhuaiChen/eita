"use client";

// A short, warm celebration shown when a dialogue completes — the product's
// promise is "evidence that I can do this", so the pop is the point.
// Three designs rotate so it doesn't feel canned.

export type Outcome = "ok" | "ok-help" | "fail";

export type CheerSpec = {
  design: 0 | 1 | 2;
  line: string;
  sub?: string;
  pieces: { e: string; left: number; delay: number; size: number }[];
};

const PRAISE_SOLO = [
  "Você falou chinês sozinho(a)!",
  "Isso — você conseguiu!",
  "Mandou muito bem!",
  "Olha você conversando em chinês!",
];
const PRAISE_HELPED = [
  "Você conseguiu — com uma ajudinha!",
  "É assim que se aprende!",
  "Cada vez mais fácil pra você!",
  "Muito bem — você chegou lá!",
];
const PRAISE_SOFT = [
  "Essa foi difícil — e você continuou!",
  "Errar faz parte. Você não desistiu!",
  "Amanhã essa sai de primeira!",
];
const CONFETTI = ["🎉", "✨", "🌟", "🎊", "💛", "🧡", "⭐", "🎈"];

// Randomness lives here (event time), not in render — keeps the compiler happy.
export function pickCelebration(outcome: Outcome, name?: string): CheerSpec {
  const design: 0 | 1 | 2 =
    outcome === "ok" ? ((Math.floor(Math.random() * 3) as 0 | 1 | 2)) : 2;
  const pool =
    outcome === "ok"
      ? PRAISE_SOLO
      : outcome === "ok-help"
        ? PRAISE_HELPED
        : PRAISE_SOFT;
  const line = pool[Math.floor(Math.random() * pool.length)];
  const subs = [
    name ? `${name}, você está aprendendo de verdade.` : "Você está aprendendo de verdade.",
    name ? `Mandou bem, ${name}!` : "Mandou bem!",
    "Cada dia um pouco mais fácil.",
  ];
  const pieces = Array.from({ length: 10 }, (_, i) => ({
    e: CONFETTI[i % CONFETTI.length],
    left: 6 + i * 9 + Math.random() * 5,
    delay: Math.random() * 0.5,
    size: 1.1 + Math.random() * 0.9,
  }));
  return {
    design,
    line,
    sub: subs[Math.floor(Math.random() * subs.length)],
    pieces,
  };
}

export default function Celebration({
  spec,
  fading,
}: {
  spec: CheerSpec;
  fading: boolean;
}) {
  const { design, line, sub, pieces } = spec;
  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-surface/95 ${
        // opacity:0 elements still capture clicks — let taps through once faded
        fading ? "cheer-fade pointer-events-none" : ""
      }`}
      role="status"
    >
      {design === 0 && (
        <div className="relative flex flex-col items-center px-6 text-center">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="confetti"
              aria-hidden="true"
              style={{
                left: `${p.left}%`,
                bottom: "30%",
                animationDelay: `${p.delay}s`,
                fontSize: `${p.size}rem`,
              }}
            >
              {p.e}
            </span>
          ))}
          <p className="cheer-in text-[4rem]" aria-hidden="true">🎉</p>
          <p className="cheer-in mt-3 text-[1.7rem] font-bold leading-tight [animation-delay:120ms]">
            {line}
          </p>
          {sub && (
            <p className="cheer-in mt-1 text-[1.15rem] text-muted [animation-delay:220ms]">
              {sub}
            </p>
          )}
        </div>
      )}

      {design === 1 && (
        <div className="relative flex flex-col items-center px-6 text-center">
          {pieces.slice(0, 6).map((p, i) => (
            <span
              key={i}
              className="confetti"
              aria-hidden="true"
              style={{
                left: `${p.left}%`,
                bottom: "25%",
                animationDelay: `${p.delay}s`,
                fontSize: `${p.size}rem`,
              }}
            >
              {p.e}
            </span>
          ))}
          <div className="stamp-in rounded-2xl border-4 border-jade px-8 py-5">
            <p className="text-[1.9rem] font-black uppercase tracking-wide text-jade">
              Sem ajuda!
            </p>
          </div>
          <p className="cheer-in mt-4 text-[1.4rem] font-semibold [animation-delay:200ms]">
            {line}
          </p>
        </div>
      )}

      {design === 2 && (
        <div className="flex flex-col items-center px-6 text-center">
          <div className="glow-pulse cheer-in flex h-28 w-28 items-center justify-center rounded-full bg-jade text-[3.2rem] text-white" aria-hidden="true">
            ✓
          </div>
          <p className="cheer-in mt-5 text-[1.6rem] font-bold leading-tight [animation-delay:120ms]">
            {line}
          </p>
          {sub && (
            <p className="cheer-in mt-1 text-[1.15rem] text-muted [animation-delay:220ms]">
              {sub}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
