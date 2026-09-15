"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLearner } from "@/lib/store";

export default function Home() {
  const { state, ready } = useLearner();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(state.profile ? "/hoje" : "/onboarding");
  }, [ready, state.profile, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p lang="zh-CN" className="zh text-[3rem] font-semibold text-accent">乒</p>
    </div>
  );
}
