"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/hoje", label: "Hoje", icon: "☀️" },
  { href: "/progresso", label: "Progresso", icon: "🌱" },
  { href: "/perfil", label: "Perfil", icon: "👤" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-5 pb-32 pt-8">{children}</main>
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
