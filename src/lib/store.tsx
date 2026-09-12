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

function load(): LearnerState {
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as LearnerState) };
  } catch {
    return empty;
  }
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
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
    const sb = getSupabase();
    if (sb) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        sb.from("eita_state")
          .upsert({ id: deviceId(), json: s, updated_at: new Date().toISOString() })
          .then(() => {});
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
    setState(empty);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ state, ready, update, startProfile, reset }),
    [state, ready, update, startProfile, reset]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLearner = () => useContext(Ctx);
