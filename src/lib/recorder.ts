// Optional self-check: capture the learner's voice while they speak so they
// can compare it to the model line. No scoring — seniors trust their own ears.
// Runs alongside SpeechRecognition (separate getUserMedia stream); if the
// device refuses a second capture we just skip playback silently.

export interface Recorder {
  stop: () => Promise<string | null>; // resolves to an object URL for playback
  cancel: () => void;
}

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function startRecording(): Recorder | null {
  if (!recorderSupported()) return null;
  let cancelled = false;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  const ready = navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      return recorder;
    })
    .catch(() => null);

  return {
    // stop() must trigger the end — the clip resolves once 'stop' fires
    stop: () =>
      ready.then(
        (rec) =>
          new Promise<string | null>((resolve) => {
            if (!rec) return resolve(null);
            if (rec.state === "inactive") return resolve(null);
            rec.onstop = () => {
              rec.stream.getTracks().forEach((t) => t.stop());
              const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
              resolve(blob.size > 0 ? URL.createObjectURL(blob) : null);
            };
            try {
              rec.stop();
            } catch {
              resolve(null);
            }
          })
      ),
    cancel: () => {
      cancelled = true;
      chunks = [];
      ready.then((rec) => {
        if (rec && rec.state !== "inactive") {
          try {
            rec.onstop = () => rec.stream.getTracks().forEach((t) => t.stop());
            rec.stop();
          } catch {}
        }
      });
    },
  };
}
