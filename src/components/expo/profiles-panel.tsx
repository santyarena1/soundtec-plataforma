"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Panel de construcción de perfiles. El trabajo se hace en tandas cortas del
 * lado del servidor y este panel las encadena: así se puede procesar todo el
 * catálogo sin chocar con el límite de tiempo de una función.
 */

interface Status {
  total: number;
  withProfile: number;
  pending: number;
  lastBuiltAt: string | null;
  model: string | null;
  byEnvironment: Array<{ environment: string; count: number }>;
}

interface BatchStats {
  built: number;
  skipped: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  errors: string[];
  pending: number;
}

const BATCH_SIZE = 20;

const ENVIRONMENT_LABEL: Record<string, string> = {
  OUTDOOR: "Exterior",
  INDOOR: "Interior",
  BOTH: "Interior y exterior",
  UNKNOWN: "Sin determinar",
  "SIN DATO": "Sin determinar",
};

export function ProfilesPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState({ built: 0, failed: 0, inputTokens: 0, outputTokens: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/ai/profiles", { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean } & Status;
      if (data.ok) setStatus(data);
    } catch {
      setMessage("No se pudo leer el estado.");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const run = useCallback(
    async (force: boolean) => {
      stopRef.current = false;
      setRunning(true);
      setErrors([]);
      setMessage(null);
      setTotals({ built: 0, failed: 0, inputTokens: 0, outputTokens: 0 });

      try {
        // Se encadenan tandas hasta que no queda nada pendiente.
        for (let round = 0; round < 500; round++) {
          if (stopRef.current) break;
          const response = await fetch("/api/admin/ai/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: BATCH_SIZE, force }),
          });
          const data = (await response.json()) as { ok: boolean; error?: string } & BatchStats;
          if (!data.ok) {
            setMessage(data.error ?? "Falló una tanda.");
            break;
          }

          setTotals((current) => ({
            built: current.built + data.built,
            failed: current.failed + data.failed,
            inputTokens: current.inputTokens + data.inputTokens + data.embeddingTokens,
            outputTokens: current.outputTokens + data.outputTokens,
          }));
          if (data.errors.length > 0) {
            setErrors((current) => Array.from(new Set([...current, ...data.errors])).slice(0, 10));
          }
          await loadStatus();

          // Una tanda que no construyó ni saltó nada significa que no queda trabajo.
          if (data.built === 0 && data.skipped === 0) break;
          if (!force && data.pending === 0) break;
        }
        setMessage("Listo.");
      } catch {
        setMessage("Se cortó la conexión durante el proceso.");
      } finally {
        setRunning(false);
        void loadStatus();
      }
    },
    [loadStatus]
  );

  const coverage = status && status.total > 0 ? Math.round((status.withProfile / status.total) * 100) : 0;
  const costUsd = ((totals.inputTokens / 1_000_000) * 0.15 + (totals.outputTokens / 1_000_000) * 0.6).toFixed(3);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Cobertura del catálogo</p>
              <p className="text-xs text-muted-foreground">
                {status
                  ? `${status.withProfile} de ${status.total} productos activos tienen perfil.`
                  : "Cargando…"}
              </p>
            </div>
            <div className="flex gap-2">
              {running ? (
                <Button variant="outline" onClick={() => (stopRef.current = true)}>
                  Detener
                </Button>
              ) : (
                <>
                  <Button onClick={() => void run(false)} disabled={!status || status.pending === 0}>
                    Procesar pendientes
                  </Button>
                  <Button variant="outline" onClick={() => void run(true)}>
                    Reprocesar todo
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${coverage}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge tone={coverage >= 90 ? "success" : coverage >= 25 ? "warning" : "muted"}>
              {coverage}% cubierto
            </Badge>
            {status?.pending ? <span>{status.pending} pendientes</span> : null}
            {status?.model ? <span>modelo {status.model}</span> : null}
          </div>

          {running || totals.built > 0 ? (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
              <p>
                {running ? "Procesando…" : "Última corrida:"} {totals.built} perfiles construidos,{" "}
                {totals.failed} con error.
              </p>
              <p className="mt-1 text-muted-foreground">
                {totals.inputTokens.toLocaleString("es-AR")} tokens de entrada ·{" "}
                {totals.outputTokens.toLocaleString("es-AR")} de salida · costo aproximado USD {costUsd}
              </p>
            </div>
          ) : null}

          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}

          {errors.length > 0 ? (
            <ul className="space-y-1 text-xs text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {status && status.byEnvironment.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium">Qué se pudo determinar</p>
            <p className="text-xs text-muted-foreground">
              Ambiente declarado en la ficha. Es el dato que antes había que adivinar en cada consulta.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {status.byEnvironment
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((row) => (
                  <li key={row.environment}>
                    <Badge tone={row.environment === "OUTDOOR" ? "accent" : "muted"}>
                      {ENVIRONMENT_LABEL[row.environment] ?? row.environment}: {row.count}
                    </Badge>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
