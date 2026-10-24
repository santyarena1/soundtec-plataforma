"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Solapas entre pantallas hermanas que comparten una entrada del menú
 * (ej. Categorías · Familias, o Interesados del catálogo · del asistente).
 */
export function SectionTabs({ tabs }: { tabs: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
