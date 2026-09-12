// PT-BR copy that keeps the tone warm and never punishing.

export const praise = {
  solo: [
    "Muito bem. Você respondeu sem ajuda.",
    "Isso. Você lembrou sozinho(a).",
    "Perfeito — e você nem precisou de dica.",
    "Exato. Essa você já dominava.",
  ],
  helped: [
    "Isso. Com uma ajudinha, você conseguiu.",
    "Boa. Agora ficou mais fácil.",
    "Certo. Da próxima sai sem dica.",
  ],
  almost: ["Quase.", "Por pouco.", "Boa tentativa."],
  again: ["Vamos tentar com uma ajuda.", "Olhe a dica e tente de novo."],
  reveal: [
    "Tudo bem. A gente vê isso de novo depois.",
    "Sem pressa — essa volta em outro momento.",
  ],
  recovery: ["Isso. Você lembrou de", "Viu? Você sabia."],
};

export const pick = <T,>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

export function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
