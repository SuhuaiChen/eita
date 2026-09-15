import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoAgenda,
  eventTopic,
  fetchGoogleEvents,
  gcalConsumeRedirect,
  gcalConnectUrl,
  gcalDisconnect,
  gcalToken,
  getAgenda,
  isLive,
} from "@/lib/calendar";
import type { Profile } from "@/lib/types";

const mkProfile = (): Profile => ({
  name: "Ana",
  level: "hsk1",
  interests: ["comida"],
  moments: [{ id: "cafe", time: "08:00", enabled: true }],
  selfConfidence: "medium",
});

// ---- tiny DOM shims (vitest runs in node env) -------------------------------
const mkStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    _m: m,
  };
};

let loc: { hash: string; pathname: string; origin: string; hostname: string; port: string };
let lstore: ReturnType<typeof mkStorage>;
let sstore: ReturnType<typeof mkStorage>;
let replaceState: ReturnType<typeof vi.fn>;

beforeEach(() => {
  loc = {
    hash: "",
    pathname: "/perfil",
    origin: "http://localhost:3000",
    hostname: "localhost",
    port: "3000",
  };
  lstore = mkStorage();
  sstore = mkStorage();
  replaceState = vi.fn((_a: unknown, _b: unknown, url: string) => {
    loc.pathname = url;
    loc.hash = "";
  });
  vi.stubGlobal("window", { location: loc });
  vi.stubGlobal("localStorage", lstore);
  vi.stubGlobal("sessionStorage", sstore);
  vi.stubGlobal("history", { replaceState });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- pure pieces ------------------------------------------------------------
describe("demoAgenda", () => {
  it("is sorted and keeps the lunch ~45min ahead", () => {
    const now = new Date(2026, 8, 15, 12, 0);
    const items = demoAgenda(now);
    const times = items.map((i) => i.start.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const lunch = items.find((i) => i.title.includes("Maria"))!;
    expect(lunch.start.getTime() - now.getTime()).toBe(45 * 60_000);
    expect(items.every((i) => i.source === "demo")).toBe(true);
  });
});

describe("eventTopic", () => {
  it.each([
    ["Consulta no dentista", "cotidiano", "🩺"],
    ["Almoço com a Maria", "restaurantes", "🍽️"],
    ["Ligar para a filha", "familia", "👨‍👩‍👧"],
    ["Reunião qualquer", "cotidiano", "📅"],
  ])("maps %s", (title, topic, emoji) => {
    expect(eventTopic(title)).toEqual({ topic, emoji });
  });
});

describe("isLive", () => {
  it("is live from ~75min before to 10min after start", () => {
    const now = new Date(2026, 8, 15, 12, 0);
    const ev = { ...demoAgenda(now)[0], start: new Date(now.getTime() + 60 * 60_000) };
    expect(isLive(ev, now)).toBe(true);
    ev.start = new Date(now.getTime() + 80 * 60_000);
    expect(isLive(ev, now)).toBe(false);
    ev.start = new Date(now.getTime() - 5 * 60_000);
    expect(isLive(ev, now)).toBe(true);
    ev.start = new Date(now.getTime() - 15 * 60_000);
    expect(isLive(ev, now)).toBe(false);
  });
});

// ---- oauth redirect + token storage -----------------------------------------
describe("gcal token lifecycle", () => {
  it("stores token + state round-trip, strips the hash", () => {
    sessionStorage.setItem("eita:gcal:state", "s1");
    loc.hash = "#access_token=tok123&expires_in=3600&state=s1";
    expect(gcalConsumeRedirect()).toBe(true);
    const t = gcalToken();
    expect(t?.token).toBe("tok123");
    expect(t!.exp).toBeGreaterThan(Date.now());
    expect(replaceState).toHaveBeenCalled();
    expect(sessionStorage.getItem("eita:gcal:state")).toBeNull();
  });

  it("rejects a mismatched state", () => {
    sessionStorage.setItem("eita:gcal:state", "s1");
    loc.hash = "#access_token=tok123&state=other";
    expect(gcalConsumeRedirect()).toBe(false);
    expect(gcalToken()).toBeNull();
  });

  it("cleans the hash and stays disconnected on error=access_denied", () => {
    loc.hash = "#error=access_denied";
    expect(gcalConsumeRedirect()).toBe(false);
    expect(gcalToken()).toBeNull();
    lokClear();
  });

  it("drops expired tokens from storage", () => {
    localStorage.setItem("eita:gcal", JSON.stringify({ token: "x", exp: Date.now() - 1 }));
    expect(gcalToken()).toBeNull();
    expect(localStorage.getItem("eita:gcal")).toBeNull();
  });

  it("connect url carries state + redirect to /perfil", () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "cid";
    const url = new URL(gcalConnectUrl());
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/perfil");
    expect(url.searchParams.get("response_type")).toBe("token");
    const st = url.searchParams.get("state")!;
    expect(st).toBe(sessionStorage.getItem("eita:gcal:state"));
  });

  it.each([
    ["127.0.0.1", "3001", "http://localhost:3001/perfil"],
    ["192.168.15.2", "3001", "http://localhost:3001/perfil"],
    ["devin-xyz.vercel.app", "", "https://devin-xyz.vercel.app/perfil"],
  ])("normalizes %s:%s redirect to %s", (hostname, port, expected) => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "cid";
    loc.hostname = hostname;
    loc.port = port;
    loc.origin = `${port ? `http://${hostname}:${port}` : `https://${hostname}`}`;
    const url = new URL(gcalConnectUrl());
    expect(url.searchParams.get("redirect_uri")).toBe(expected);
  });

  function lokClear() {
    // replaceState stripped the hash
    expect(replaceState).toHaveBeenCalled();
  }
});

// ---- google fetch + agenda fallback ------------------------------------------
describe("fetchGoogleEvents", () => {
  const now = new Date(2026, 8, 15, 12, 0);

  it("maps timed and all-day events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            { id: "a", summary: "Consulta", start: { dateTime: "2026-09-15T14:30:00-03:00" } },
            { id: "b", summary: "Aniversário do neto", start: { date: "2026-09-15" } },
            { id: "c", start: {} },
          ],
        }),
      }))
    );
    const items = await fetchGoogleEvents("tok", now);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("g:a");
    expect(items[0].start.getHours()).toBe(14);
    // all-day anchored at 9am LOCAL on the right day (not UTC midnight)
    expect(items[1].start.getDate()).toBe(15);
    expect(items[1].start.getHours()).toBe(9);
    expect(items[1].emoji).toBe("👨‍👩‍👧");
  });

  it("throws with .status on http errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    await expect(fetchGoogleEvents("tok", now)).rejects.toMatchObject({ status: 401 });
  });
});

describe("getAgenda", () => {
  const now = new Date(2026, 8, 15, 12, 0);
  const seedToken = () =>
    localStorage.setItem("eita:gcal", JSON.stringify({ token: "tok", exp: Date.now() + 3_600_000 }));

  it("returns google events when the fetch works", async () => {
    seedToken();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) }))
    );
    const a = await getAgenda(mkProfile(), now);
    expect(a.source).toBe("google");
  });

  it("disconnects only on auth errors (401/403)", async () => {
    seedToken();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    const a = await getAgenda(mkProfile(), now);
    expect(a.source).toBe("demo");
    expect(gcalToken()).toBeNull();
  });

  it("keeps the token on transient network errors", async () => {
    seedToken();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    const a = await getAgenda(mkProfile(), now);
    expect(a.source).toBe("demo");
    expect(gcalToken()?.token).toBe("tok");
  });

  it("demo agenda when never connected", async () => {
    gcalDisconnect();
    const a = await getAgenda(mkProfile(), now);
    expect(a.source).toBe("demo");
    expect(a.items.length).toBeGreaterThan(0);
  });
});
