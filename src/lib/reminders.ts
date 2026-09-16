"use client";

// Honest reminders: the Notification API fires while the app tab/app is open
// (or shortly after, if the service worker stays alive). No push server — the
// copy in Perfil says exactly this.

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function remindersOn(): boolean {
  try {
    return (
      notificationsSupported() &&
      localStorage.getItem("eita:reminders") === "1" &&
      Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

export async function enableReminders(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const p = await Notification.requestPermission();
  if (p !== "granted") return false;
  try {
    localStorage.setItem("eita:reminders", "1");
  } catch {}
  return true;
}

export function disableReminders() {
  try {
    localStorage.removeItem("eita:reminders");
  } catch {}
}

// fires once per moment per day — the marker lives in sessionStorage so a new
// browser session can remind again (it's a nudge, not a lock)
const FIRED_KEY = "eita:reminded";

function alreadyFired(key: string): boolean {
  try {
    const s = JSON.parse(sessionStorage.getItem(FIRED_KEY) ?? "[]") as string[];
    return s.includes(key);
  } catch {
    return false;
  }
}

function markFired(key: string) {
  try {
    const s = JSON.parse(sessionStorage.getItem(FIRED_KEY) ?? "[]") as string[];
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...s.slice(-20), key]));
  } catch {}
}

export function maybeNotify(momentLabel: string, momentId: string, day: string) {
  if (!remindersOn()) return;
  const key = `${day}:${momentId}`;
  if (alreadyFired(key)) return;
  const title = "Hora da sua conversinha ☀️";
  const opts = {
    body: `${momentLabel} — menos de um minuto, no seu ritmo.`,
    icon: "/icon-192.png",
    tag: key, // same tag replaces rather than stacks
  };
  try {
    new Notification(title, opts);
    markFired(key);
    return;
  } catch {
    // iOS/Safari PWA: the constructor throws — notifications must go through
    // the service worker registration instead
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, opts))
      .then(() => markFired(key))
      .catch(() => {});
  }
}
