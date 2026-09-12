// zh-CN speech recognition via the Web Speech API (Chrome/Edge/Safari).
// No key needed — the browser does the work. Returns null when unsupported.

type RecResult = { transcript: string; final: boolean };
type RecCallbacks = {
  onResult: (r: RecResult) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
};

interface SR {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function ctor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as new () => SR) ??
    (w.webkitSpeechRecognition as new () => SR) ??
    null
  );
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

/** start listening; returns a stop() handle */
export function listen(cb: RecCallbacks): { stop: () => void } | null {
  const C = ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = "zh-CN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    const ev = e as { results: { isFinal: boolean; 0: { transcript: string } }[]; resultIndex: number };
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      cb.onResult({ transcript: r[0].transcript, final: r.isFinal });
    }
  };
  rec.onend = () => cb.onEnd?.();
  rec.onerror = (e) => {
    const err = (e as { error?: string }).error ?? "error";
    cb.onError?.(err);
  };

  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}
