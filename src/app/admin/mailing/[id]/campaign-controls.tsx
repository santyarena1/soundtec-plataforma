"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Ban, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { cancelCampaign, pauseCampaign, processCampaignStep, resumeCampaign } from "@/server/actions/mailing";

/** Pausa entre vueltas de la pantalla (cada vuelta manda varias tandas). */
const LOOP_PAUSE_MS = 1500;

/**
 * Avance del envío. Mientras la pantalla está abierta va mandando tandas; si
 * se cierra, el cron de Vercel sigue cada 5 minutos desde donde quedó.
 */
export function CampaignControls({ id, status, note, total, done, simulated }: { id: string; status: string; note: string | null; total: number; done: number; simulated: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [running, setRunning] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    if (status !== "SENDING") return;
    let cancelled = false;
    (async () => {
      setRunning(true);
      while (!cancelled && !stopped.current) {
        let result: Awaited<ReturnType<typeof processCampaignStep>>;
        try {
          result = await processCampaignStep({ id });
        } catch {
          break; // Corte de red: el cron sigue solo.
        }
        if (cancelled) break;
        router.refresh();
        if (!result.ok || result.status !== "SENDING" || result.done || result.note) break;
        await new Promise((resolve) => setTimeout(resolve, LOOP_PAUSE_MS));
      }
      setRunning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, status, router]);

  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) return void toast.error(result.error ?? "No se pudo.");
      toast.success(message);
      router.refresh();
    });

  if (status === "SENT" || status === "CANCELED") {
    return note && status === "CANCELED" ? <p className="text-sm text-muted-foreground">{note}</p> : null;
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {status === "SENDING" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Pause className="h-4 w-4 text-amber-700" />}
            {status === "SENDING" ? (simulated ? "Simulando el envío…" : "Saliendo en tandas…") : "En pausa"} {done.toLocaleString("es-AR")} de {total.toLocaleString("es-AR")}
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "SENDING" ? (running ? "Podés cerrar esta pantalla: sigue sola cada 5 minutos." : "Sigue sola cada 5 minutos aunque cierres la pantalla.") : "No sale nada hasta que la reanudes."}
          </p>
        </div>
        <div className="flex gap-2">
          {status === "SENDING" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                stopped.current = true;
                act(() => pauseCampaign({ id }), "Campaña en pausa.");
              }}
            >
              <Pause className="h-4 w-4" /> Pausar
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => act(() => resumeCampaign({ id }), "Reanudada.")}>
              <Play className="h-4 w-4" /> Reanudar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await confirmDialog({ message: `¿Cancelar la campaña? Los ${Math.max(0, total - done).toLocaleString("es-AR")} que faltan no la reciben. Lo que ya salió, salió.`, confirmLabel: "Cancelar envío", tone: "danger" });
              if (!ok) return;
              stopped.current = true;
              act(() => cancelCampaign({ id }), "Campaña cancelada.");
            }}
          >
            <Ban className="h-4 w-4" /> Cancelar
          </Button>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      {note ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p> : null}
    </section>
  );
}
