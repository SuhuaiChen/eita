"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LearnerState, Profile } from "./types";
import { initState } from "./engine";
import { deviceId, getSupabase } from "./supabase";

const KEY = "eita:state:v1";
const BAK = "eita:state:v1:bak";

const empty: LearnerState = {
  profile: null,
  concepts: {},
  confidencePressure: 0,
  interactions: [],
  recentTargets: [],
  recentDialogues: [],
  dailyDone: {},
  lastSeenVersion: 1,
};

/** shape check — a corrupted blob should never silently wipe progress */
function valid(s: LearnerState): boolean {
  if (!s || typeof s !== "object") return false;
  if (s.profile !== null && (typeof s.profile !== "object" || typeof s.profile.name !== "string"))
    return false;
  if (!s.concepts || typeof s.concepts !== "object" || Array.isArray(s.concepts)) return false;
  return Array.isArray(s.interactions);
}

function load(): LearnerState {
  if (typeof window === "undefined") return empty;
  // primary first, then the backup of the previous good snapshot
  for (const k of [KEY, BAK]) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = { ...empty, ...(JSON.parse(raw) as LearnerState) };
      if (valid(parsed)) return parsed;
    } catch {}
  }
  return empty;
}

interface Store {
  state: LearnerState;
  ready: boolean;
  update: (fn: (s: LearnerState) => LearnerState) => void;
  startProfile: (p: Profile) => void;
  reset: () => void;
}

const Ctx = createContext<Store>({
  state: empty,
  ready: false,
  update: () => {},
  startProfile: () => {},
  reset: () => {},
});

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LearnerState>(empty);
  const [ready, setReady] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // hydrate from localStorage after mount (client-only store)
    queueMicrotask(() => {
      setState(load());
      setReady(true);
    });
  }, []);

  const persist = useCallback((s: LearnerState) => {
    try {
      // keep the last good snapshot as a fallback before overwriting
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BAK, prev);
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
    const sb = getSupabase();
    if (sb) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        try {
          Promise.resolve(
            sb.from("eita_state")
              .upsert({ id: deviceId(), json: s, updated_at: new Date().toISOString() })
          ).then(() => {}, () => {});
        } catch {}
      }, 800);
    }
  }, []);

  const update = useCallback(
    (fn: (s: LearnerState) => LearnerState) => {
      setState((prev) => {
        const next = fn(structuredClone(prev));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const startProfile = useCallback(
    (p: Profile) => {
      const s = initState(p);
      setState(s);
      persist(s);
    },
    [persist]
  );

  const reset = useCallback(() => {
    // cancel any pending sync first — it would resurrect the old state remotely
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    setState(empty);
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(BAK);
    } catch {}
    const sb = getSupabase();
    if (sb) {
      try {
        Promise.resolve(sb.from("eita_state").delete().eq("id", deviceId())).catch(() => {});
      } catch {}
    }
  }, []);

  const value = useMemo(
    () => ({ state, ready, update, startProfile, reset }),
    [state, ready, update, startProfile, reset]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLearner = () => useContext(Ctx);
