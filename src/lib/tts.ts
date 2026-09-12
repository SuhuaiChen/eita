// zh-CN text-to-speech using the device's system voice.
// Keeping speech in the browser makes playback immediate and works without a
// server key or a network round-trip.

let zhVoice: SpeechSynthesisVoice | null | undefined;

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

export function speak(text: string, opts: { slow?: boolean } = {}) {
  if (!text) return;
  stopSpeak();
  nativeSpeak(text, !!opts.slow);
}

export function stopSpeak() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
