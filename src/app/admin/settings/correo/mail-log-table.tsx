"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { retryMailAction, retryPendingMailsAction } from "@/server/actions/mail-account";

type Row = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  status: string;
  channel: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  retryable: boolean;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  SENT: { label: "Salió", tone: "bg-emerald-100 text-emerald-800" },
  FAILED: { label: "Falló", tone: "bg-red-100 text-red-800" },
  SKIPPED: { label: "Sin casilla", tone: "bg-amber-100 text-amber-900" },
  QUEUED: { label: "En cola", tone: "bg-sky-100 text-sky-800" },
};

const CHANNEL: Record<string, string> = { smtp: "Casilla", resend: "Resend" };

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function MailLogTable({ rows, pending }: { rows: Row[]; pending: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();

  const retry = (id: string) =>
    start(async () => {
      const result = await retryMailAction(id);
      if (!result.ok) return void toast.error(result.error);
      if (result.sent) toast.success("Salió.");
      else toast.error(`Volvió a fallar: ${result.error ?? "sin detalle"}`);
      router.refresh();
    });

  const retryAll = () =>
    start(async () => {
      const result = await retryPendingMailsAction();
      if (!result.ok) return void toast.error(result.error);
      toast[result.failed ? "error" : "success"](`Salieron ${result.sent}${result.failed ? `, siguen sin salir ${result.failed}` : ""}.`);
      router.refresh();
    });

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-5">
        <div>
          <h2 className="text-base font-semibold">Últimos envíos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cada mail que manda el sistema (no incluye Campañas). Los que fallan se pueden reintentar; los de «Olvidé mi clave» no se guardan: la persona pide otro link.</p>
        </div>
        {pending ? (
          <button type="button" onClick={retryAll} disabled={busy} className="ml-auto inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Reintentar pendientes ({pending})
          </button>
        ) : null}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto p-4 pt-2">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Para</th>
                <th className="py-2 pr-3">Asunto</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, tone: "bg-secondary" };
                return (
                  <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground">{when(r.createdAt)}</td>
                    <td className="py-2.5 pr-3 text-xs">{r.kind}</td>
                    <td className="max-w-[220px] break-words py-2.5 pr-3 text-xs">{r.to}</td>
                    <td className="max-w-[280px] py-2.5 pr-3">
                      <p className="truncate" title={r.subject}>{r.subject}</p>
                      {r.error ? <p className="mt-0.5 text-xs text-destructive">{r.error}</p> : null}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.channel ? CHANNEL[r.channel] ?? r.channel : ""}
                        {r.attempts > 1 ? ` · ${r.attempts} intentos` : ""}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {r.retryable ? (
                        <button type="button" onClick={() => retry(r.id)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
                          <RotateCw className="h-3.5 w-3.5" /> Reintentar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Todavía no salió ningún mail desde que se activó el registro.</p>
      )}
    </section>
  );
}
