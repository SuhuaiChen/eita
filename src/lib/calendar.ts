// Agenda model — Google Calendar when connected, a built-in demo agenda
// otherwise. Each event can spawn a micro-dialogue ~1h before it starts.
import type { MomentId, Profile, TopicId } from "./types";
import { dayKey } from "./engine";

export interface AgendaItem {
  id: string;
  title: string;
  start: Date;
  source: "google" | "demo" | "routine";
  topic: TopicId;
  /** routine moment used for dialogue style/closers */
  moment: MomentId;
  emoji: string;
}

const GCAL_TOKEN_KEY = "eita:gcal";
const GCAL_STATE_KEY = "eita:gcal:state";

// ---------- event → topic/tone mapping --------------------------------------

const EVENT_MAP: { re: RegExp; topic: TopicId; emoji: string; title?: string }[] = [
  { re: /m[eé]dic|consulta|doutor|dentista|hospital|exame/i, topic: "cotidiano", emoji: "🩺" },
  { re: /mercado|compra|supermercado|feira|shopping/i, topic: "compras", emoji: "🛒" },
  { re: /almo[cç]o|lunch|comida|restaurante|jantar|pizza|churrasco/i, topic: "restaurantes", emoji: "🍽️" },
  { re: /caf[eé]|padaria|lanche/i, topic: "comida", emoji: "☕" },
  { re: /caminhada|parque|andar|pra[cç]a|natureza|passeio/i, topic: "natureza", emoji: "🌳" },
  { re: /viagem|aeroporto|voo|hotel|praia|viajar/i, topic: "viagens", emoji: "✈️" },
  { re: /filh|neto|fam[ií]lia|irm[ãa]|m[ãa]e|pai|anivers[aá]rio|liga/i, topic: "familia", emoji: "👨‍👩‍👧" },
  { re: /cinema|filme|teatro|show|s[eé]rie/i, topic: "filmes", emoji: "🎬" },
  { re: /m[uú]sica|piano|coral|dança/i, topic: "musica", emoji: "🎵" },
  { re: /futebol|esporte|gin[aá]stica|yoga|hidro/i, topic: "esportes", emoji: "⚽" },
  { re: /chin[eê]s|mandarim|aula|curso|professor/i, topic: "cultura", emoji: "🏮" },
  { re: /amig|encontro|visita|festa/i, topic: "cotidiano", emoji: "🏠" },
];

export function eventTopic(title: string): { topic: TopicId; emoji: string } {
  const hit = EVENT_MAP.find((e) => e.re.test(title));
  return hit ? { topic: hit.topic, emoji: hit.emoji } : { topic: "cotidiano", emoji: "📅" };
}

function nearestMoment(at: Date): MomentId {
  const h = at.getHours() + at.getMinutes() / 60;
  const table: [number, MomentId][] = [
    [10.5, "cafe"],
    [15.5, "almoco"],
    [18.5, "tarde"],
    [24, "noite"],
  ];
  for (const [limit, m] of table) if (h < limit) return m;
  return "cafe";
}

// ---------- demo agenda -------------------------------------------------------

// Hardcoded day for the demo — the lunch is the star: it's always ~45min ahead
// so "Conversar" is live whenever someone opens the app. Real events come only
// when the learner actually connects Google Calendar.
const FIXED: { title: string; topic: TopicId; emoji: string; hour: number; minute: number }[] = [
  { title: "Café da manhã", topic: "comida", emoji: "☕", hour: 8, minute: 0 },
  { title: "Caminhada no parque", topic: "natureza", emoji: "🌳", hour: 10, minute: 0 },
  { title: "Aula de chinês", topic: "cultura", emoji: "🏮", hour: 15, minute: 0 },
  { title: "Ligar para a filha", topic: "familia", emoji: "👨‍👩‍👧", hour: 19, minute: 0 },
];

export function demoAgenda(now: Date): AgendaItem[] {
  const daySeed = dayKey(now);
  const item = (
    i: number,
    title: string,
    topic: TopicId,
    emoji: string,
    at: Date
  ): AgendaItem => ({
    id: `demo:${daySeed}:${i}`,
    title,
    start: at,
    source: "demo",
    topic,
    moment: nearestMoment(at),
    emoji,
  });

  const items = FIXED.map((e, i) => {
    const at = new Date(now);
    at.setHours(e.hour, e.minute, 0, 0);
    return item(i, e.title, e.topic, e.emoji, at);
  });

  // the demo's anchor: lunch with Maria, always ~45min from now — and always
  // almoço-themed regardless of the wall clock
  const lunch = new Date(now.getTime() + 45 * 60_000);
  lunch.setSeconds(0, 0);
  items.push({ ...item(99, "Almoço com a Maria", "restaurantes", "🍽️", lunch), moment: "almoco" });

  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---------- google calendar ----------------------------------------------------

export function googleConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

/** auth-code + refresh-cookie flow on when the server has the client secret */
export function gcalCodeFlow(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_CODE_FLOW === "1";
}

const GCAL_LINKED_KEY = "eita:gcal:linked";

/** "is the calendar connected?" — survives access-token expiry under code flow */
export function gcalLinked(): boolean {
  if (typeof window === "undefined") return false;
  if (gcalCodeFlow()) return localStorage.getItem(GCAL_LINKED_KEY) === "1";
  return gcalToken() !== null;
}

/** the raw stored access token — null when expired or absent */
export function gcalToken(): { token: string; exp: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GCAL_TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (t.exp <= Date.now()) {
      localStorage.removeItem(GCAL_TOKEN_KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

function storeAccessToken(token: string, ttlSec: number) {
  try {
    localStorage.setItem(
      GCAL_TOKEN_KEY,
      JSON.stringify({ token, exp: Date.now() + ttlSec * 1000 })
    );
  } catch {}
}

/** shared in-flight refresh so concurrent agenda calls don't double-POST */
let refreshP: Promise<string | null> | null = null;

function doRefresh(): Promise<string | null> {
  refreshP ??= (async () => {
    const res = await fetch("/api/gcal/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) {
      if (res?.status === 401) gcalDisconnect();
      return null;
    }
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!data?.access_token) return null;
    storeAccessToken(data.access_token, data.expires_in ?? 3600);
    return data.access_token;
  })().finally(() => {
    refreshP = null;
  });
  return refreshP;
}

/** a usable access token — refreshes via the httpOnly cookie when expired */
export async function gcalAccessToken(): Promise<string | null> {
  const t = gcalToken();
  if (t) return t.token;
  if (!gcalCodeFlow() || localStorage.getItem(GCAL_LINKED_KEY) !== "1") return null;
  return doRefresh();
}

export function gcalDisconnect() {
  localStorage.removeItem(GCAL_TOKEN_KEY);
  localStorage.removeItem(GCAL_LINKED_KEY);
  if (gcalCodeFlow()) {
    // revoke the refresh cookie server-side — best effort; keepalive so a tab
    // closing right after the click doesn't orphan the grant
    fetch("/api/gcal/token", { method: "DELETE", keepalive: true }).catch(() => {});
  }
}

/** localhost / LAN / *.local hosts — where the state check can't round-trip
 * because the connect URL normalizes the origin to localhost */
function isLocalOrigin(): boolean {
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "::1" ||
    h.endsWith(".local") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h)
  );
}

/** true → consume the response; false → reject it. On non-local origins the
 * state MUST round-trip — otherwise a crafted `?code=` link would connect the
 * victim to an attacker's calendar. */
function stateOk(state: string | null): boolean {
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(GCAL_STATE_KEY);
  } catch {}
  sessionStorage.removeItem(GCAL_STATE_KEY);
  if (!expected) return isLocalOrigin();
  return state === expected;
}

/** consume the OAuth redirect back on /perfil — code or implicit hash */
export async function gcalConsumeRedirect(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // --- auth-code flow: ?code=...&state=... in the query string
  const qp = new URLSearchParams(window.location.search);
  const code = qp.get("code");
  if (code) {
    if (!stateOk(qp.get("state"))) {
      history.replaceState(null, "", window.location.pathname);
      return false;
    }
    history.replaceState(null, "", window.location.pathname);
    const res = await fetch("/api/gcal/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        redirect_uri: `${window.location.origin}/perfil`,
      }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!data?.access_token) return false;
    storeAccessToken(data.access_token, data.expires_in ?? 3600);
    localStorage.setItem(GCAL_LINKED_KEY, "1");
    return true;
  }
  // code-flow errors also arrive in the query string
  if (qp.get("error")) {
    history.replaceState(null, "", window.location.pathname);
    return false;
  }

  // --- implicit flow: #access_token=... in the hash
  if (!window.location.hash.includes("=")) return false;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const token = p.get("access_token");
  const error = p.get("error");
  if (!token && !error) return false;
  // the state we sent must round-trip — ignore foreign/injected responses
  if (!stateOk(p.get("state"))) {
    history.replaceState(null, "", window.location.pathname);
    return false;
  }
  history.replaceState(null, "", window.location.pathname);
  if (!token) return false;
  storeAccessToken(token, Number(p.get("expires_in")) || 3600);
  return true;
}

export function gcalConnectUrl(): string {
  const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  const l = window.location;
  // redirect_uri must match a registered URI exactly — normalize any local
  // alias (127.0.0.1, LAN IP, *.local) to localhost so one registration
  // covers every address the dev server might be opened from
  const host = l.hostname.replace(/^\[|\]$/g, "");
  const isLocal =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host);
  const origin = isLocal ? `http://localhost${l.port ? `:${l.port}` : ""}` : l.origin;
  const redirect = `${origin}/perfil`;
  const state =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    sessionStorage.setItem(GCAL_STATE_KEY, state);
  } catch {}
  const q = new URLSearchParams({
    client_id: cid,
    redirect_uri: redirect,
    response_type: gcalCodeFlow() ? "code" : "token",
    scope: "https://www.googleapis.com/auth/calendar.events.readonly",
    include_granted_scopes: "true",
    state,
    ...(gcalCodeFlow() ? { access_type: "offline", prompt: "consent" } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function fetchGoogleEvents(token: string, now: Date): Promise<AgendaItem[]> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 0);
  const q = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw Object.assign(new Error(`gcal ${res.status}`), { status: res.status });
  interface GEvent {
    id: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
  }
  const data = (await res.json()) as { items?: GEvent[] };
  return (data.items ?? [])
    .map((e): AgendaItem | null => {
      // timed events carry dateTime; all-day events carry a date (YYYY-MM-DD)
      // which we anchor at 9am local — parse it by hand because `new Date(s)`
      // would treat it as UTC midnight and can land on the wrong day
      let at: Date;
      if (e.start?.dateTime) {
        at = new Date(e.start.dateTime);
      } else if (e.start?.date) {
        const [y, m, d] = e.start.date.split("-").map(Number);
        at = new Date(y, m - 1, d, 9, 0);
      } else {
        return null;
      }
      const { topic, emoji } = eventTopic(e.summary ?? "");
      return {
        id: `g:${e.id}`,
        title: e.summary ?? "Compromisso",
        start: at,
        source: "google" as const,
        topic,
        moment: nearestMoment(at),
        emoji,
      };
    })
    .filter((e): e is AgendaItem => e !== null);
}

// ---------- assembled agenda ----------------------------------------------------

export async function getAgenda(
  profile: Profile,
  now: Date
): Promise<{ items: AgendaItem[]; source: "google" | "demo" }> {
  const t = await gcalAccessToken();
  if (t) {
    try {
      const items = await fetchGoogleEvents(t, now);
      return { items: items.sort((a, b) => a.start.getTime() - b.start.getTime()), source: "google" };
    } catch (err) {
      // a revoked token should drop the connection; a flaky network
      // shouldn't — keep the link and just show the demo agenda this render
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        if (!gcalCodeFlow()) {
          gcalDisconnect();
        } else {
          // the stored token may be revoked remotely while still unexpired —
          // drop it and try one refresh before giving up on the real agenda
          localStorage.removeItem(GCAL_TOKEN_KEY);
          const t2 = await doRefresh();
          if (t2) {
            try {
              const items = await fetchGoogleEvents(t2, now);
              return {
                items: items.sort((a, b) => a.start.getTime() - b.start.getTime()),
                source: "google",
              };
            } catch {}
          }
        }
      }
    }
  }
  return { items: demoAgenda(now), source: "demo" };
}

/** is this event's dialogue live right now? (from ~75min before until start) */
export function isLive(item: AgendaItem, now: Date): boolean {
  const ms = item.start.getTime() - now.getTime();
  return ms <= 75 * 60_000 && ms > -10 * 60_000;
}

