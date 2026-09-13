import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Acceso al asistente desde el catálogo. Convive con el buscador tradicional:
 * para encontrar un SKU puntual el buscador sigue siendo mejor, así que este
 * bloque no lo reemplaza ni le compite el foco.
 */
export function AssistantEntry({
  href = "/expo",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 transition-all duration-200 hover:border-accent hover:shadow-card active:scale-[0.995] ${
        className ?? ""
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">Preguntale a Soundtec AI</span>
        <span className="block text-xs text-muted-foreground">
          ¿Qué producto necesitás? Consultá compatibilidad, aplicaciones o especificaciones.
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-accent transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
