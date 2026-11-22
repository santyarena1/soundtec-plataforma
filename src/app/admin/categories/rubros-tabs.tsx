import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pestañas de la pantalla «Rubros». «Sin rubro» y «Revisión» son las pantallas
 * de la reclasificación (bandeja y propuestas) y «Series» la de series del
 * fabricante: se navega entre todas con esta misma barra.
 */
export const RUBROS_TABS = [
  { id: "arbol", label: "Árbol", href: "/admin/categories" },
  { id: "sin-rubro", label: "Sin rubro", href: "/admin/products/reclasificacion?ver=uno-a-uno" },
  { id: "revision", label: "Revisión", href: "/admin/products/reclasificacion" },
  { id: "equivalencias", label: "Equivalencias", href: "/admin/categories?tab=equivalencias" },
  { id: "pendientes-tango", label: "Pendientes en Tango", href: "/admin/categories?tab=pendientes-tango" },
  { id: "series", label: "Series", href: "/admin/categories/series" },
] as const;

export type RubrosTabId = (typeof RUBROS_TABS)[number]["id"];

export function RubrosTabs({ active, counts }: { active: RubrosTabId; counts?: Partial<Record<RubrosTabId, number>> }) {
  return (
    <nav aria-label="Rubros" className="flex flex-wrap gap-1 border-b border-border">
      {RUBROS_TABS.map((tab) => {
        const count = counts?.[tab.id];
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active === tab.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              active === tab.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {count ? <span className="ml-1 rounded-full bg-secondary px-1.5 text-xs tabular-nums">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
