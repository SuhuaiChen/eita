"use client";

import { useEffect } from "react";
import { applyPrefs, loadPrefs } from "@/lib/prefs";

/** applies saved font-size / contrast prefs before first paint matters */
export default function PrefsBootstrap() {
  useEffect(() => {
    applyPrefs(loadPrefs());
  }, []);
  return null;
}
