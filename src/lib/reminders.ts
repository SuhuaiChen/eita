"use client";

// Honest reminders: the Notification API fires while the app tab/app is open
// (or shortly after, if the service worker stays alive). No push server — the
// copy in Perfil says exactly this.

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function remindersOn(): boolean {
  return (
    notificationsSupported() &&
    localStorage.getItem("eita:reminders") === "1" &&
    Notification.permission === "granted"
  );
}

export async function enableReminders(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const p = await Notification.requestPermission();
  if (p !== "granted") return false;
  localStorage.setItem("eita:reminders", "1");
  return true;
}

export function disableReminders() {
  localStorage.removeItem("eita:reminders");
}

// fires once per moment per day — the marker lives in sessionStorage so a new
// browser session can remind again (it's a nudge, not a lock)
const fired = new Set<string>();

export function maybeNotify(momentLabel: string, momentId: string, day: string) {
  if (!remindersOn()) return;
  const key = `${day}:${momentId}`;
  if (fired.has(key)) return;
  fired.add(key);
  try {
    new Notification("Hora da sua conversinha ☀️", {
      body: `${momentLabel} — menos de um minuto, no seu ritmo.`,
      icon: "/icon-192.png",
      tag: key,
    });
  } catch {
    // some browsers require a service worker for notifications — in that
    // case the in-app card already does the nudging, so we just skip
  }
}
