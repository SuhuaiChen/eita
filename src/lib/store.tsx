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
import { onAuth, syncKey } from "./auth";

const KEY = "eita:state:v1";
const BAK = "eita:state:v1:bak";
const AT = "eita:state:at";
const RESET_AT = "eita:reset:at"; // tombstone: a signed-out reset still blocks remote restore
const LAST_UID = "eita:lastUid";

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
  /** signed-in email when Supabase auth is configured + active */
  userEmail: string | null;
  /** true once after a remote snapshot was restored over this device's state */
  restoredFromRemote: boolean;
  clearRestoredFlag: () => void;
  update: (fn: (s: LearnerState) => LearnerState) => void;
  startProfile: (p: Profile) => void;
  reset: () => void;
}

const Ctx = createContext<Store>({
  state: empty,
  ready: false,
  userEmail: null,
  restoredFromRemote: false,
  clearRestoredFlag: () => {},
  update: () => {},
  startProfile: () => {},
  reset: () => {},
});

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LearnerState>(empty);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [restoredFromRemote, setRestoredFromRemote] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidRef = useRef<string | null>(null);
  // when our local snapshot was last written — persists across reloads so a
  // stale remote row can't clobber fresh local progress on sign-in
  const localUpdatedAt = useRef(0);

  useEffect(() => {
    // hydrate from localStorage after mount (client-only store)
    queueMicrotask(() => {
      setState(load());
      try {
        localUpdatedAt.current = Number(localStorage.getItem(AT)) || 0;
      } catch {}
      setReady(true);
    });
  }, []);

  // auth listener: on sign-in, pull the remote snapshot; newer remote state
  // wins (a returning learner on a new device gets their progress back)
  useEffect(() => {
    const off = onAuth((session) => {
      const uid = session?.user?.id ?? null;
      uidRef.current = uid;
      setUserEmail(session?.user?.email ?? null);
      if (!uid) return;
      try {
        localStorage.setItem(LAST_UID, uid);
      } catch {}
      const sb = getSupabase();
      if (!sb) return;
      (async () => {
        try {
          const { data } = await sb
            .from("eita_state")
            .select("json, updated_at")
            .eq("id", syncKey(uid, deviceId()))
            .maybeSingle();
          if (!data?.json) return;
          const remoteAt = new Date(data.updated_at ?? 0).getTime();
          // a reset tombstone newer than the remote row means the learner
          // wiped progress while signed out — delete the stale row instead
          // of resurrecting it
          const resetAt = Number(localStorage.getItem(RESET_AT)) || 0;
          if (resetAt && remoteAt <= resetAt) {
            localStorage.removeItem(RESET_AT);
            Promise.resolve(
              sb.from("eita_state").delete().eq("id", syncKey(uid, deviceId()))
            ).catch(() => {});
            return;
          }
          const remote = { ...empty, ...(data.json as LearnerState) };
          if (!valid(remote)) return;
          // remote wins when local has no real progress (no profile OR a
          // fresh onboard with zero interactions — the seeded baseline the
          // remote snapshot also encodes), or when it's fresher than our
          // last persisted write
          setState((cur) => {
            const localIsEmpty = !cur.profile || cur.interactions.length === 0;
            if (!localIsEmpty && remoteAt <= localUpdatedAt.current) return cur;
            // remote wins — stamp AT so later auth events don't re-restore,
            // and drop any debounced upsert still holding the losing state
            if (syncTimer.current) {
              clearTimeout(syncTimer.current);
              syncTimer.current = null;
            }
            try {
              localStorage.setItem(BAK, JSON.stringify(cur));
              localStorage.setItem(KEY, JSON.stringify(remote));
              localUpdatedAt.current = Math.max(remoteAt, Date.now());
              localStorage.setItem(AT, String(localUpdatedAt.current));
            } catch {}
            setRestoredFromRemote(true);
            return remote;
          });
        } catch {}
      })();
    });
    return off;
  }, []);

  // multi-tab: keep tabs in sync — another tab's write/reset lands here via
  // the storage event so divergent states can't fight over the remote row
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key?.startsWith("eita:state") && e.key !== RESET_AT) return;
      try {
        localUpdatedAt.current = Number(localStorage.getItem(AT)) || 0;
      } catch {}
      setState(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((s: LearnerState) => {
    localUpdatedAt.current = Date.now();
    try {
      // keep the last good snapshot as a fallback before overwriting
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BAK, prev);
      localStorage.setItem(KEY, JSON.stringify(s));
      localStorage.setItem(AT, String(localUpdatedAt.current));
    } catch {}
    const sb = getSupabase();
    if (sb) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        try {
          Promise.resolve(
            sb.from("eita_state")
              .upsert({
                id: syncKey(uidRef.current, deviceId()),
                json: s,
                updated_at: new Date().toISOString(),
              })
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
    localUpdatedAt.current = 0;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(BAK);
      localStorage.removeItem(AT);
      // tombstone: if the remote delete can't run (signed out → RLS blocks
      // u: rows), the next sign-in sees this marker and deletes instead of
      // restoring the stale snapshot
      localStorage.setItem(RESET_AT, String(Date.now()));
      // mid-dialogue resume caches + reminders/pitch flags shouldn't survive
      sessionStorage.removeItem("eita:resumePractice");
      sessionStorage.removeItem("eita:resumeThread");
      localStorage.removeItem("eita:reminders");
      localStorage.removeItem("eita:agendaPitchSeen");
    } catch {}
    const sb = getSupabase();
    if (sb) {
      // delete every row that could hold this learner's state — the device
      // row plus the current OR last-known account row (a signed-out reset
      // can't reach u: rows; the tombstone above handles that on next sign-in)
      const lastUid = uidRef.current ?? localStorage.getItem(LAST_UID);
      const keys = [
        syncKey(null, deviceId()),
        lastUid ? syncKey(lastUid, deviceId()) : null,
      ].filter(Boolean) as string[];
      try {
        Promise.resolve(sb.from("eita_state").delete().in("id", keys)).catch(() => {});
      } catch {}
      localStorage.removeItem(LAST_UID);
    }
  }, []);

  const clearRestoredFlag = useCallback(() => setRestoredFromRemote(false), []);

  const value = useMemo(
    () => ({ state, ready, userEmail, restoredFromRemote, clearRestoredFlag, update, startProfile, reset }),
    [state, ready, userEmail, restoredFromRemote, clearRestoredFlag, update, startProfile, reset]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLearner = () => useContext(Ctx);
