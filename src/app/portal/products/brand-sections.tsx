import type { ReactNode } from "react";
import { Star } from "lucide-react";
import type { ListingSection } from "@/lib/brand-listing-order";

/**
 * Dentro de una marca («Más relevantes», sin búsqueda): la grilla partida en
 * «Destacados» y un bloque por rubro, cada uno con su encabezado. Sin secciones
 * (búsqueda, otro orden, varias marcas) devuelve la grilla tal cual.
 */
export function BrandSections<T>({
  sections,
  items,
  children: renderGrid,
}: {
  sections: readonly ListingSection[] | undefined;
  items: readonly T[];
  children: (chunk: T[]) => ReactNode;
}) {
  if (!sections?.length || (sections.length === 1 && sections[0].kind === "other")) return <>{renderGrid([...items])}</>;
  return (
    <div className="space-y-8">
      {sections.map((section, i) => {
        const chunk = items.slice(section.startIndex, sections[i + 1]?.startIndex ?? items.length);
        if (chunk.length === 0) return null;
        return (
          <section key={`${section.key}-${section.startIndex}`} aria-label={section.title}>
            <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-foreground">
                {section.kind === "featured" ? <Star className="h-3.5 w-3.5 fill-current text-accent" aria-hidden /> : null}
                {section.title}
              </h2>
              {section.context ? <span className="text-xs text-muted-foreground">{section.context}</span> : null}
              {section.continued ? <span className="text-xs text-muted-foreground">· sigue de la página anterior</span> : null}
            </header>
            {renderGrid(chunk)}
          </section>
        );
      })}
    </div>
  );
}
