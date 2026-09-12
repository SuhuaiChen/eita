// zh-CN text-to-speech.
// Primary: Ali DashScope qwen-tts via /api/tts (natural neural voice, key
// stays server-side). Fallback: Web Speech API zh-CN voice.
// `slow` always uses the Web Speech API (rate control).

let zhVoice: SpeechSynthesisVoice | null | undefined;
let audio: HTMLAudioElement | null = null;
let apiBroken = false; // remember failures inside a session → skip the hop

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  if (zhVoice !== undefined) return zhVoice;
  const voices = speechSynthesis.getVoices();
  zhVoice =
    voices.find((v) => /^zh[-_]CN/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    voices.find((v) => /chinese|mandarin|ting|mei|li-?li|sin-?ji/i.test(v.name)) ||
    null;
  return zhVoice;
}

if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = () => {
    zhVoice = undefined;
    pickVoice();
  };
}

function nativeSpeak(text: string, slow: boolean) {
  if (typeof speechSynthesis === "undefined" || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[＿_]/g, "…"));
  u.lang = "zh-CN";
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = slow ? 0.5 : 0.82;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

const urlCache = new Map<string, string>();

let lastText = "";

export function speak(text: string, opts: { slow?: boolean } = {}) {
  if (!text) return;
  lastText = text;
  stopSpeak();
  if (opts.slow || apiBroken || typeof fetch === "undefined") {
    nativeSpeak(text, !!opts.slow);
    return;
  }
  const cached = urlCache.get(text);
  if (cached) {
    play(cached);
    return;
  }
  fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d: { url?: string }) => {
      if (!d.url) throw new Error("no url");
      urlCache.set(text, d.url);
      play(d.url);
    })
    .catch(() => {
      apiBroken = true;
      nativeSpeak(text, false);
    });
}

function play(url: string) {
  try {
    audio = new Audio(url);
    audio.play().catch(() => nativeSpeak(lastText, false));
  } catch {
    nativeSpeak(lastText, false);
  }
}

export function stopSpeak() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  audio?.pause();
  audio = null;
}
