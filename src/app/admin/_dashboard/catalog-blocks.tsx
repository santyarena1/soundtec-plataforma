import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncHealthState } from "@/lib/dashboard/sync-health";
import { loadCatalogHealth } from "@/server/dashboard/catalog-health";
import { loadSyncStatus } from "@/server/dashboard/sync-status";
import { prisma } from "@/lib/prisma";
import type { DashboardViewer } from "@/server/dashboard/viewer";
import { BlockError, Count, Panel, Quiet, SubHead, shortDate, timeOrDate } from "./ui";

/** Productos activos a los que les falta algo, y cambios de costo de los proveedores en la semana. */
export async function CatalogHealthBlock({ viewer, className }: { viewer: DashboardViewer; className?: string }) {
  let data: Awaited<ReturnType<typeof loadCatalogHealth>>;
  try {
    data = await loadCatalogHealth(viewer);
  } catch (error) {
    console.error("[dashboard] catálogo", error);
    return <BlockError title="Salud del catálogo" className={className} />;
  }
  const pc = data.priceChanges;
  return (
    <Panel eyebrow="Catálogo" title="Salud del catálogo" action={{ href: "/admin/products?active=yes", label: "Productos" }} className={className} tour="dash-catalog">
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">
        Sobre <Count value={data.active} /> productos activos. Cada número abre el listado ya filtrado.
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {data.counts.map((c) => {
          const share = data.active ? c.count / data.active : 0;
          return (
            <li key={c.key}>
              <Link
                href={c.href}
                title={c.help}
                className="group flex h-full flex-col rounded-md border border-border px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("text-xl font-semibold leading-tight tabular-nums", c.count === 0 ? "text-success" : share > 0.25 ? "text-warning" : "")}>
                  <Count value={c.count} />
                </span>
                <span className="text-xs font-medium group-hover:text-accent">{c.label}</span>
                <span className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-foreground/25" style={{ width: `${Math.min(100, share * 100)}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {pc ? (
        <>
          <SubHead aside="últimos 7 días">Cambios de costo de proveedores</SubHead>
          {pc.ups + pc.downs === 0 ? (
            <Quiet>Las sincronizaciones de la semana no cambiaron costos.</Quiet>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex gap-3 sm:flex-col">
                <div className="rounded-md bg-destructive/5 px-3 py-2">
                  <p className="flex items-center gap-1 text-lg font-semibold leading-tight text-destructive tabular-nums">
                    <ArrowUpRight className="h-4 w-4" /> {pc.ups}
                  </p>
                  <p className="text-[11px] text-muted-foreground">subas{pc.avgUpPct != null ? ` · prom. +${pc.avgUpPct} %` : ""}</p>
                </div>
                <div className="rounded-md bg-success/5 px-3 py-2">
                  <p className="flex items-center gap-1 text-lg font-semibold leading-tight text-success tabular-nums">
                    <ArrowDownRight className="h-4 w-4" /> {pc.downs}
                  </p>
                  <p className="text-[11px] text-muted-foreground">bajas{pc.avgDownPct != null ? ` · prom. ${pc.avgDownPct} %` : ""}</p>
                </div>
              </div>
              <ul className="min-w-0 divide-y divide-border text-sm">
                {pc.biggest.map((c) => (
                  <li key={`${c.productId}-${c.at.getTime()}`} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/admin/products/${c.productId}`} className="min-w-0 truncate hover:text-accent hover:underline">{c.name}</Link>
                    <span className={cn("shrink-0 text-xs font-semibold tabular-nums", c.pct > 0 ? "text-destructive" : "text-success")}>
                      {c.pct > 0 ? "+" : ""}
                      {c.pct} %
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Sale del registro de cada sincronización (costo anterior y nuevo). Las ediciones a mano y los Excel importados no quedan registrados y no aparecen.
          </p>
        </>
      ) : null}
    </Panel>
  );
}

const STATE_STYLE: Record<SyncHealthState, string> = {
  ok: "bg-success",
  running: "bg-accent animate-pulse",
  failed: "bg-destructive",
  stuck: "bg-destructive",
  late: "bg-warning",
  never: "bg-warning",
  off: "bg-border",
};

/** Estado de cada sincronización de proveedor (solo administradores). */
export async function SyncBlock({ className }: { className?: string }) {
  let rows: Awaited<ReturnType<typeof loadSyncStatus>>;
  let imports: number;
  try {
    [rows, imports] = await Promise.all([
      loadSyncStatus(),
      prisma.importBatch.count({ where: { status: { in: ["PENDING", "MAPPING", "REVIEWING"] } } }),
    ]);
  } catch (error) {
    console.error("[dashboard] sincronizaciones", error);
    return <BlockError title="Sincronizaciones" className={className} />;
  }
  const now = new Date();
  return (
    <Panel eyebrow="Proveedores" title="Sincronizaciones" action={{ href: "/admin/sync", label: "Abrir" }} className={className} tour="dash-sync">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.kind} className="flex items-start gap-3 py-2.5 first:pt-0">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATE_STYLE[r.health.state])} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{r.label}</p>
                <span className={cn("shrink-0 text-xs font-medium", r.needsAttention ? "text-destructive" : "text-muted-foreground")}>{r.health.label}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.lastAppliedAt ? `Aplicada ${timeOrDate(r.lastAppliedAt, now)}` : "Nunca se aplicó"}
                {r.lastPriceChanges ? ` · ${r.lastPriceChanges} cambios de costo` : ""}
                {r.lastRunAt && (!r.lastAppliedAt || r.lastRunAt > r.lastAppliedAt) ? ` · última corrida ${shortDate(r.lastRunAt)}` : ""}
              </p>
              {r.health.detail ? <p className="mt-0.5 line-clamp-2 text-xs text-destructive/90">{r.health.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-3">
        <Link href="/admin/imports" className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2 text-sm hover:bg-secondary">
          <span>Importaciones de Excel pendientes</span>
          <span className={cn("font-semibold tabular-nums", imports ? "text-warning" : "text-muted-foreground")}>{imports}</span>
        </Link>
      </div>
    </Panel>
  );
}
