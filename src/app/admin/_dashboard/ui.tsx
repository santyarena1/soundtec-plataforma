import * as React from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
import type { Comparison } from "@/lib/dashboard/periods";

/**
 * Piezas comunes del inicio del panel. Un bloque = un Panel; los números
 * grandes van con tabular-nums y las etiquetas chicas arriba (eyebrow), así
 * la jerarquía se lee igual en todos.
 */

export function Panel({
  eyebrow,
  title,
  action,
  className,
  children,
  tour,
}: {
  eyebrow?: string;
  title: string;
  action?: { href: string; label: string };
  className?: string;
  children: React.ReactNode;
  tour?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card", className)} data-tour={tour}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p> : null}
          <h2 className="text-base font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
        </div>
        {action ? <PanelLink href={action.href}>{action.label}</PanelLink> : null}
      </header>
      <div className="flex min-w-0 flex-1 flex-col px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Subtítulo dentro de un panel («Entraron hoy», «Lo más buscado»). */
export function SubHead({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-baseline justify-between gap-2 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</h3>
      {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
    </div>
  );
}

/** Mensaje cuando no hay nada que mostrar: corto y sin dramatismo. */
export function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-secondary/50 px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

/** Aviso chico cuando un bloque no pudo cargar: el resto de la página sigue. */
export function BlockError({ title, className }: { title: string; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-dashed border-border bg-card p-5", className)} role="status">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <TriangleAlert className="h-3.5 w-3.5 text-warning" />
        No se pudo cargar este bloque. Recargá la página en un rato; si sigue, avisá por un ticket.
      </p>
    </section>
  );
}

/** Esqueleto con la forma aproximada del bloque, para que la página no salte. */
export function BlockSkeleton({ className, rows = 4, title }: { className?: string; rows?: number; title?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-5 shadow-card", className)} aria-busy="true" aria-label={title ? `Cargando ${title}` : "Cargando"}>
      <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-muted/70" style={{ width: `${100 - ((i * 13) % 30)}%` }} />
        ))}
      </div>
    </section>
  );
}

/** Variación contra el mes anterior, con color semántico (más es mejor salvo que se indique). */
export function Delta({ cmp, lowerIsBetter = false }: { cmp: Comparison; lowerIsBetter?: boolean }) {
  if (cmp.trend === "flat") return <span className="text-xs text-muted-foreground">= mes pasado</span>;
  if (cmp.pct === null) return <span className="text-xs text-muted-foreground">mes pasado: 0</span>;
  const good = cmp.trend === "up" ? !lowerIsBetter : lowerIsBetter;
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
      {cmp.trend === "up" ? "▲" : "▼"} {Math.abs(cmp.pct)} %
    </span>
  );
}

export function Count({ value, className }: { value: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{value.toLocaleString("es-AR")}</span>;
}

const ART = "America/Argentina/Buenos_Aires";

export function shortDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: ART });
}

export function timeOrDate(d: Date, now: Date = new Date()): string {
  const sameDay = d.toLocaleDateString("es-AR", { timeZone: ART }) === now.toLocaleDateString("es-AR", { timeZone: ART });
  return sameDay ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: ART }) : shortDate(d);
}

export function usd(value: number): string {
  return formatUsd(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
