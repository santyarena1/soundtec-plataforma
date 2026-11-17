import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Acceso al asistente desde el catálogo: una píldora azul con degradé y aro de
 * color (el tratamiento que tenía «Tutorial online»), en el encabezado al lado
 * del título. Convive con el buscador: para un SKU puntual el buscador sigue
 * siendo mejor, así que no ocupa una franja propia.
 */
export function AssistantEntry({ href = "/expo", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      title="Consultá compatibilidad, aplicaciones o especificaciones"
      className={cn(
        "group inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-accent to-[hsl(206_92%_46%)] pl-1.5 pr-4 text-sm font-semibold text-accent-foreground shadow-sm ring-2 ring-accent/25 transition-[box-shadow,filter] duration-200 hover:shadow-md hover:ring-accent/40 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 active:brightness-95",
        className
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>
      Preguntale a Soundtec AI
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </Link>
  );
}
