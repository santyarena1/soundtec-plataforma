"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AudienceStats } from "@/components/mailing/audience-panel";
import type { CampaignAudience, RecipientStats } from "@/lib/mailing/audience";
import { previewCampaignAudience, startCampaign } from "@/server/actions/mailing";

/** «2026-11-17T09:30» en hora argentina → ISO. */
function argentinaLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function tomorrowNineArgentina(): string {
  const now = new Date(Date.now() - 3 * 3600_000 + 24 * 3600_000);
  return `${now.toISOString().slice(0, 10)}T09:00`;
}

/**
 * Confirmación del envío: muestra a cuántos les llega de verdad (después de
 * sacar repetidos, bajas y excluidos) y deja mandar ahora o programar.
 */
export function SendDialog({
  open,
  onClose,
  campaignId,
  audience,
  subject,
  simulate,
  dailyLimit,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  audience: CampaignAudience;
  subject: string;
  simulate: boolean;
  dailyLimit: number;
  onStarted: () => void;
}) {
  const [stats, setStats] = useState<RecipientStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(tomorrowNineArgentina());
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStats(null);
    setError(null);
    start(async () => {
      const result = await previewCampaignAudience(audience);
      if (!result.ok) return setError(result.error);
      setStats(result.stats);
    });
  }, [open, audience]);

  const days = stats && dailyLimit > 0 && !simulate ? Math.ceil(stats.total / dailyLimit) : 1;
  const problems = [!subject.trim() ? "Falta el asunto." : "", !audience.include.length ? "No elegiste ninguna lista." : "", stats && stats.total === 0 ? "No queda nadie a quien mandarle." : ""].filter(Boolean);

  function go() {
    const scheduledAt = when === "later" ? argentinaLocalToIso(at) : null;
    if (when === "later" && !scheduledAt) return void toast.error("Elegí día y hora.");
    start(async () => {
      const result = await startCampaign({ id: campaignId, scheduledAt });
      if (!result.ok) return void toast.error(result.error);
      toast.success(
        result.scheduled
          ? `Programada: sale sola a ${result.total.toLocaleString("es-AR")} personas.`
          : result.simulated
            ? `Simulando el envío a ${result.total.toLocaleString("es-AR")} personas (no sale nada).`
            : `Saliendo a ${result.total.toLocaleString("es-AR")} personas.`
      );
      onClose();
      onStarted();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mandar la campaña"
      icon={<Send className="h-5 w-5" />}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Volver
          </Button>
          <Button disabled={busy || !stats || problems.length > 0} onClick={go}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : when === "later" ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {stats ? (when === "later" ? `Programar para ${stats.total.toLocaleString("es-AR")}` : `${simulate ? "Simular envío a" : "Mandar a"} ${stats.total.toLocaleString("es-AR")}`) : "Calculando…"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-secondary/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Le llega a</p>
          {stats ? <AudienceStats stats={stats} /> : error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground" />}
          <p className="mt-2 truncate text-sm">
            Asunto: <b>{subject || "—"}</b>
          </p>
        </div>

        {problems.length ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {problems.join(" ")}
          </div>
        ) : null}

        {simulate ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Modo prueba: se registra todo como simulado y no le llega nada a nadie.
          </div>
        ) : days > 1 ? (
          <p className="text-sm text-muted-foreground">
            Con el límite de {dailyLimit.toLocaleString("es-AR")} mails por día sale en unos <b>{days} días</b>: cada día sigue sola desde donde quedó.
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { key: "now", label: "Ahora", help: "Empieza a salir en tandas en este momento." },
              { key: "later", label: "Programar", help: "Sale sola el día y la hora que elijas." },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setWhen(option.key)}
              className={cn("rounded-lg border p-3 text-left transition", when === option.key ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40")}
            >
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="text-xs text-muted-foreground">{option.help}</p>
            </button>
          ))}
        </div>
        {when === "later" ? (
          <div className="space-y-1">
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Día y hora (Argentina)" />
            <p className="text-xs text-muted-foreground">Hora de Argentina.</p>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Una vez que arranca se puede pausar o cancelar, pero lo que ya salió no se puede volver atrás.</p>
      </div>
    </Modal>
  );
}
