"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const SOURCES = [
  { slug: "crestron", name: "Crestron (Xtrabon)" },
  { slug: "sonance", name: "Sonance / IPORT / JAMES / BLAZE" },
] as const;

type SourceSlug = (typeof SOURCES)[number]["slug"];
type SyncMode = "preview" | "apply";

const MODE_LABELS: Record<string, string> = {
  preview: "Previsualización",
  apply: "Aplicación",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En curso",
  PREVIEW_READY: "Previsualización lista",
  APPLYING: "Aplicando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
};

const STAGED_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  applied: "Aplicado",
  error: "Error",
};

const ROW_ACTION_LABELS: Record<string, string> = {
  create: "Nuevo",
  update: "Actualizar",
  noop: "Sin cambios",
};

function modeLabel(value: string): string {
  return MODE_LABELS[value] ?? value;
}

function runStatusLabel(value: string): string {
  return RUN_STATUS_LABELS[value] ?? value;
}

function stagedStatusLabel(value: string): string {
  return STAGED_STATUS_LABELS[value] ?? value;
}

function rowActionLabel(value: string): string {
  return ROW_ACTION_LABELS[value] ?? value;
}

interface SourceSchedule {
  enabled: boolean;
  everyHours: number;
  atHourArg: number | null;
}

interface ScheduleConfig {
  crestron: SourceSchedule;
  sonance: SourceSchedule;
}

interface ScheduleResponse {
  ok: boolean;
  schedule?: ScheduleConfig;
  error?: string;
}

const FREQUENCIES = [
  { value: 1, label: "Cada hora" },
  { value: 6, label: "Cada 6 horas" },
  { value: 24, label: "Diaria" },
  { value: 168, label: "Semanal" },
] as const;

interface BatchSummary {
  done: boolean;
  processed: number;
  total: number;
  nextOffset: number | null;
  created: number;
  updated: number;
  priceChanges: number;
  stockChanges: number;
  errors: number;
}

interface StartResponse extends Partial<BatchSummary> {
  ok: boolean;
  runId?: string;
  error?: string;
}

interface StepResponse extends Partial<BatchSummary> {
  ok: boolean;
  error?: string;
}

interface RunRecord {
  id: string;
  source: string;
  mode: string;
  status: string;
  totalItems: number;
  processed: number;
  matched: number;
  created: number;
  updated: number;
  priceChanges: number;
  stockChanges: number;
  errors: number;
  startedAt: string;
  finishedAt: string | null;
}

interface StagedRow {
  matchValue: string;
  action: string;
  status: string;
  diffJson: unknown;
  error: string | null;
}

interface RunResponse {
  ok: boolean;
  run?: RunRecord;
  rows?: StagedRow[];
  error?: string;
}

interface RunsResponse {
  ok: boolean;
  runs?: RunRecord[];
  error?: string;
}

interface DiffInfo {
  priceChanged: boolean;
  stockChanged: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado";
}

async function readJson<T extends { ok: boolean; error?: string }>(
  response: Response
): Promise<T> {
  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new Error(`Respuesta inválida del servidor (HTTP ${response.status})`);
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? `Error HTTP ${response.status}`);
  }
  return data;
}

function requireSummary(data: Partial<BatchSummary>): BatchSummary {
  if (
    typeof data.done !== "boolean" ||
    typeof data.processed !== "number" ||
    typeof data.total !== "number" ||
    typeof data.created !== "number" ||
    typeof data.updated !== "number" ||
    typeof data.priceChanges !== "number" ||
    typeof data.stockChanges !== "number" ||
    typeof data.errors !== "number"
  ) {
    throw new Error("El servidor devolvió un progreso incompleto");
  }
  return {
    done: data.done,
    processed: data.processed,
    total: data.total,
    nextOffset: data.nextOffset ?? null,
    created: data.created,
    updated: data.updated,
    priceChanges: data.priceChanges,
    stockChanges: data.stockChanges,
    errors: data.errors,
  };
}

async function runWithPolling(
  source: SourceSlug,
  mode: SyncMode,
  onProgress: (summary: BatchSummary) => void
): Promise<{ runId: string; summary: BatchSummary }> {
  const start = await readJson<StartResponse>(
    await fetch(`/api/admin/sync/${source}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    })
  );
  if (!start.runId) throw new Error("El servidor no devolvió el identificador del proceso");

  let summary = requireSummary(start);
  onProgress(summary);
  let steps = 0;
  while (!summary.done) {
    if (steps++ >= 500) {
      throw new Error("Se alcanzó el límite de lotes; el proceso puede continuarse más tarde");
    }
    const step = await readJson<StepResponse>(
      await fetch(`/api/admin/sync/run/${start.runId}/step`, {
        method: "POST",
      })
    );
    summary = requireSummary(step);
    onProgress(summary);
  }
  return { runId: start.runId, summary };
}

function parseDiff(value: unknown): DiffInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { priceChanged: false, stockChanged: false };
  }
  const diff = value as Record<string, unknown>;
  return {
    priceChanged: diff.priceChanged === true,
    stockChanged: diff.stockChanged === true,
  };
}

function statusTone(
  status: string
): "success" | "warning" | "destructive" | "muted" {
  if (status === "COMPLETED" || status === "applied") return "success";
  if (status === "FAILED" || status === "error" || status === "CANCELLED") {
    return "destructive";
  }
  if (
    status === "RUNNING" ||
    status === "APPLYING" ||
    status === "PREVIEW_READY"
  ) {
    return "warning";
  }
  return "muted";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function UnifiedSyncPanel() {
  const [source, setSource] = useState<SourceSlug>("crestron");
  const [runningMode, setRunningMode] = useState<SyncMode | null>(null);
  const [completedMode, setCompletedMode] = useState<SyncMode | null>(null);
  const [progress, setProgress] = useState<BatchSummary | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<{
    tone: "success" | "destructive";
    text: string;
  } | null>(null);

  const loadRecentRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const data = await readJson<RunsResponse>(
        await fetch("/api/admin/sync/runs", { cache: "no-store" })
      );
      setRecentRuns(data.runs ?? []);
    } catch (loadError) {
      setError((current) => current ?? errorMessage(loadError));
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    setLoadingSchedule(true);
    setScheduleMessage(null);
    try {
      const data = await readJson<ScheduleResponse>(
        await fetch("/api/admin/sync/schedule", { cache: "no-store" })
      );
      if (!data.schedule) {
        throw new Error("El servidor no devolvió la programación");
      }
      setSchedule(data.schedule);
    } catch (scheduleError) {
      setScheduleMessage({
        tone: "destructive",
        text: errorMessage(scheduleError),
      });
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentRuns();
    void loadSchedule();
  }, [loadRecentRuns, loadSchedule]);

  function updateSchedule(
    sourceSlug: SourceSlug,
    patch: Partial<SourceSchedule>
  ) {
    setSchedule((current) =>
      current
        ? {
            ...current,
            [sourceSlug]: { ...current[sourceSlug], ...patch },
          }
        : current
    );
    setScheduleMessage(null);
  }

  async function handleSaveSchedule() {
    if (!schedule) return;
    setSavingSchedule(true);
    setScheduleMessage(null);
    try {
      const data = await readJson<ScheduleResponse>(
        await fetch("/api/admin/sync/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(schedule),
        })
      );
      if (!data.schedule) {
        throw new Error("El servidor no devolvió la programación guardada");
      }
      setSchedule(data.schedule);
      setScheduleMessage({
        tone: "success",
        text: "Programación guardada.",
      });
    } catch (scheduleError) {
      setScheduleMessage({
        tone: "destructive",
        text: errorMessage(scheduleError),
      });
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleRun(mode: SyncMode) {
    if (
      mode === "apply" &&
      !window.confirm(
        "Esta acción escribirá cambios en los productos. ¿Querés continuar?"
      )
    ) {
      return;
    }

    setRunningMode(mode);
    setCompletedMode(null);
    setProgress(null);
    setRunId(null);
    setRows([]);
    setError(null);
    try {
      const result = await runWithPolling(source, mode, setProgress);
      setRunId(result.runId);
      const detail = await readJson<RunResponse>(
        await fetch(`/api/admin/sync/run/${result.runId}`, {
          cache: "no-store",
        })
      );
      setRows(detail.rows ?? []);
      setCompletedMode(mode);
      await loadRecentRuns();
    } catch (runError) {
      setError(errorMessage(runError));
      await loadRecentRuns();
    } finally {
      setRunningMode(null);
    }
  }

  const busy = runningMode !== null;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="heading-3">Fuente de productos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Elegí una fuente para revisar sus cambios o aplicarlos al catálogo.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOURCES.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => setSource(item.slug)}
                disabled={busy}
                className={`rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  source === item.slug
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs mt-0.5">
                  {item.slug === "crestron"
                    ? "Precios, disponibilidad y logística."
                    : "Catálogo, contenido, imágenes y relaciones."}
                </p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void handleRun("preview")}
            >
              {runningMode === "preview" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {runningMode === "preview" ? "Previsualizando…" : "Previsualizar"}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void handleRun("apply")}
            >
              {runningMode === "apply" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              {runningMode === "apply" ? "Sincronizando…" : "Sincronizar ahora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="heading-3">Programación automática</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                El cron corre cada hora y ejecuta cada fuente según esta configuración.
                Requiere CRON_SECRET configurado en Vercel.
              </p>
            </div>
            {schedule && (
              <Badge tone={schedule.crestron.enabled || schedule.sonance.enabled ? "success" : "muted"}>
                {schedule.crestron.enabled || schedule.sonance.enabled
                  ? "activa"
                  : "desactivada"}
              </Badge>
            )}
          </div>

          {loadingSchedule ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando programación…
            </div>
          ) : schedule ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {SOURCES.map((item) => {
                  const sourceSchedule = schedule[item.slug];
                  const isPreset = FREQUENCIES.some(
                    (frequency) => frequency.value === sourceSchedule.everyHours
                  );
                  return (
                    <div
                      key={item.slug}
                      className="rounded-md border border-border bg-background p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{item.name}</p>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={sourceSchedule.enabled}
                          onClick={() =>
                            updateSchedule(item.slug, {
                              enabled: !sourceSchedule.enabled,
                            })
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            sourceSchedule.enabled
                              ? "border-success/40 bg-success/10 text-success"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {sourceSchedule.enabled ? "Activa" : "Inactiva"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                          <span className="block text-xs font-medium text-muted-foreground">
                            Frecuencia
                          </span>
                          <select
                            value={sourceSchedule.everyHours}
                            onChange={(event) =>
                              updateSchedule(item.slug, {
                                everyHours: Number(event.target.value),
                              })
                            }
                            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                          >
                            {!isPreset && (
                              <option value={sourceSchedule.everyHours}>
                                Cada {sourceSchedule.everyHours} horas
                              </option>
                            )}
                            {FREQUENCIES.map((frequency) => (
                              <option key={frequency.value} value={frequency.value}>
                                {frequency.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1.5">
                          <span className="block text-xs font-medium text-muted-foreground">
                            Hora (Argentina)
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            step={1}
                            value={sourceSchedule.atHourArg ?? ""}
                            placeholder="Cualquiera"
                            onChange={(event) =>
                              updateSchedule(item.slug, {
                                atHourArg:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {scheduleMessage && (
                  <p
                    className={`text-xs ${
                      scheduleMessage.tone === "success"
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {scheduleMessage.text}
                  </p>
                )}
                <Button
                  size="sm"
                  disabled={savingSchedule}
                  onClick={() => void handleSaveSchedule()}
                >
                  {savingSchedule && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {savingSchedule ? "Guardando…" : "Guardar programación"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 py-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-sm">
                {scheduleMessage?.text ?? "No se pudo cargar la programación."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="p-4 flex items-start gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {progress && (
        <>
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {busy ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                  <p className="text-sm font-medium">
                    {busy ? "Procesando lotes…" : "Proceso finalizado"}
                  </p>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {progress.processed} / {progress.total}
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  { label: "Creados", value: progress.created },
                  { label: "Actualizados", value: progress.updated },
                  { label: "Precios", value: progress.priceChanges },
                  { label: "Stock", value: progress.stockChanges },
                  { label: "Errores", value: progress.errors },
                  { label: "Avance", value: `${percent}%` },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-lg font-bold tabular-nums">{item.value}</p>
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {!busy && completedMode && (
            <Card>
              <CardContent className="p-4 flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p className="text-sm font-medium">
                  {completedMode === "preview"
                    ? "Previsualización (no se aplicó nada)"
                    : "Sincronización aplicada"}
                  {runId ? ` · Proceso ${runId}` : ""}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {completedMode && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="heading-3">Resultados</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Primeras {rows.length} filas registradas para este proceso.
              </p>
            </div>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No hay filas para mostrar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5">SKU</th>
                      <th className="px-4 py-2.5">Acción</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5">Precio</th>
                      <th className="px-4 py-2.5">Stock</th>
                      <th className="px-4 py-2.5">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row, index) => {
                      const diff = parseDiff(row.diffJson);
                      return (
                        <tr
                          key={`${row.matchValue}-${index}`}
                          className="hover:bg-muted/20"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {row.matchValue}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone="muted">{rowActionLabel(row.action)}</Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone={statusTone(row.status)}>
                              {stagedStatusLabel(row.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {diff.priceChanged ? (
                              <span className="text-warning font-medium">Cambio</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {diff.stockChanged ? (
                              <span className="text-warning font-medium">Cambio</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-destructive max-w-[280px]">
                            {row.error ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="heading-3">Procesos recientes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Últimas sincronizaciones manuales y automáticas.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={loadingRuns}
              onClick={() => void loadRecentRuns()}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${
                  loadingRuns ? "animate-spin" : ""
                }`}
              />
              Actualizar
            </Button>
          </div>
          {loadingRuns && recentRuns.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando procesos…
            </div>
          ) : recentRuns.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay procesos registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Fuente</th>
                    <th className="px-4 py-2.5">Modo</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 text-right">Procesados</th>
                    <th className="px-4 py-2.5 text-right">Creados</th>
                    <th className="px-4 py-2.5 text-right">Actualizados</th>
                    <th className="px-4 py-2.5 text-right">Errores</th>
                    <th className="px-4 py-2.5">Inicio</th>
                    <th className="px-4 py-2.5">Fin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{run.source}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {modeLabel(run.mode)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={statusTone(run.status)}>
                          {runStatusLabel(run.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                        {run.processed} / {run.totalItems}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                        {run.created}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                        {run.updated}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                        {run.errors}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {formatDate(run.startedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(run.finishedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
