"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLearner } from "@/lib/store";

const NAV = [
  { href: "/hoje", label: "Hoje", icon: "☀️" },
  { href: "/progresso", label: "Progresso", icon: "🌱" },
  { href: "/perfil", label: "Perfil", icon: "👤" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { restoredFromRemote, clearRestoredFlag } = useLearner();
  const [showRestored, setShowRestored] = useState(false);

  // "your progress came back" — shown once when a signed-in learner opens a
  // fresh device and the cloud snapshot lands over the empty local state
  useEffect(() => {
    if (!restoredFromRemote) return;
    queueMicrotask(() => setShowRestored(true));
    const t = setTimeout(() => {
      setShowRestored(false);
      clearRestoredFlag();
    }, 6000);
    return () => clearTimeout(t);
  }, [restoredFromRemote, clearRestoredFlag]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-5 pb-32 pt-8">
        {showRestored && (
          <div
            role="status"
            className="rise mb-4 flex items-center justify-between gap-3 rounded-2xl bg-jade-soft px-4 py-3 text-[1rem] text-jade"
          >
            <span>☁️ Seu progresso foi restaurado neste aparelho.</span>
            <button
              onClick={() => {
                setShowRestored(false);
                clearRestoredFlag();
              }}
              aria-label="Dispensar aviso"
              className="min-h-11 min-w-11 shrink-0"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </main>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[1.05rem] ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="text-[1.4rem] leading-none" aria-hidden>
                  {n.icon}
                </span>
                <span className={active ? "font-semibold" : ""}>{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
