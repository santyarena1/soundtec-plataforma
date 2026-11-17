import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CategoryCrumb = { id: string; name: string; href: string };

/**
 * Camino de rubros («Sonido › Bafles pasivos › Techo»): cada tramo lleva al
 * catálogo filtrado por ese nivel. En el listado, el último es el elegido y la
 * ✕ lo quita; en la ficha todos los tramos son links.
 */
export function CategoryPath({
  crumbs,
  rootHref,
  clearable = false,
  linkLast = false,
  className,
}: {
  crumbs: CategoryCrumb[];
  rootHref?: string;
  clearable?: boolean;
  linkLast?: boolean;
  className?: string;
}) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Rubro" className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm", className)}>
      {rootHref ? (
        <>
          <Link href={rootHref} className="text-muted-foreground hover:text-foreground hover:underline">
            Rubros
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </>
      ) : null}
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={crumb.id} className="flex items-center gap-1.5">
            {last && !linkLast ? (
              <span className="font-semibold text-foreground" aria-current="page">
                {crumb.name}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className={cn("hover:text-foreground hover:underline", last ? "font-medium text-foreground" : "text-muted-foreground")}
              >
                {crumb.name}
              </Link>
            )}
            {!last ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}
          </span>
        );
      })}
      {clearable && rootHref ? (
        <Link
          href={rootHref}
          aria-label="Quitar el filtro de rubro"
          title="Quitar el filtro de rubro"
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </nav>
  );
}
