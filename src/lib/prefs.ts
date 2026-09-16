"use client";

// appearance preferences — separate from learner state so they're device-local
// (a senior may want big text on the phone but not in the account profile)

export interface Prefs {
  fontSize: "normal" | "grande";
  highContrast: boolean;
}

const KEY = "eita:prefs:v1";

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        fontSize: p.fontSize === "grande" ? "grande" : "normal",
        highContrast: !!p.highContrast,
      };
    }
  } catch {}
  return { fontSize: "normal", highContrast: false };
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  applyPrefs(p);
}

export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("font-grande", p.fontSize === "grande");
  root.classList.toggle("high-contrast", p.highContrast);
}
