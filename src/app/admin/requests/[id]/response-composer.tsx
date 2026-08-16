"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CornerDownLeft, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { adminRespondRequest } from "@/server/actions/requests";
import { generateRequestAiSuggestion } from "@/server/actions/ai-request";
import { ADMIN_ASSIGNABLE_STATUSES, REQUEST_STATUS_META, suggestedNextStatus } from "@/lib/request-status";

/** Qué le pasa al cliente cuando guardás con cada estado. */
const OUTCOME: Record<string, string> = {
  IN_REVIEW: "Ve que estás trabajando su pedido. Todavía no es una propuesta cerrada.",
  ANSWERED: "Ve tu respuesta como la propuesta oficial y puede aceptarla o repreguntar.",
  CONFIRMED: "Queda como acuerdo cerrado y pasa a preparación.",
  REJECTED: "Ve que no avanzamos. Conviene explicar el motivo en el texto.",
  CLOSED: "Se archiva sin más acciones pendientes.",
};

interface Props {
  requestId: string;
  currentStatus: string;
  savedResponse: string;
  storedAiSuggestion: string;
}

export function ResponseComposer({ requestId, currentStatus, savedResponse, storedAiSuggestion }: Props) {
  const [text, setText] = useState(savedResponse);
  const [status, setStatus] = useState<string>(suggestedNextStatus(currentStatus));
  const [aiText, setAiText] = useState(savedResponse ? "" : storedAiSuggestion);
  const [aiPending, startAi] = useTransition();
  const [saving, startSaving] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const trimmed = text.trim();
  const dirty = trimmed !== savedResponse.trim() || status !== currentStatus;
  const needsConfirm = status === "REJECTED" || status === "CLOSED";

  function runAi() {
    startAi(async () => {
      const r = await generateRequestAiSuggestion(requestId);
      if (r?.ok) {
        setAiText(r.suggestion);
        toast.success("Borrador generado", { description: "Revisalo y usalo si te sirve." });
      } else {
        toast.error(r?.error || "No se pudo generar el borrador.");
      }
    });
  }

  function useAiText(mode: "replace" | "append") {
    setText((prev) => (mode === "replace" || !prev.trim() ? aiText : `${prev.trim()}\n\n${aiText}`));
    setAiText("");
    toast.success(mode === "replace" ? "Texto reemplazado" : "Texto agregado al final");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function submit() {
    setConfirmOpen(false);
    startSaving(async () => {
      const r = await adminRespondRequest({ requestId, status, adminResponse: trimmed || null });
      if (r.ok) {
        toast.success(trimmed ? "Respuesta enviada al cliente" : "Estado actualizado", {
          description: trimmed
            ? `La solicitud quedó como “${REQUEST_STATUS_META[status as keyof typeof REQUEST_STATUS_META].label}” y el texto ya está visible en su portal.`
            : `La solicitud quedó como “${REQUEST_STATUS_META[status as keyof typeof REQUEST_STATUS_META].label}”.`,
        });
        router.refresh();
      } else {
        toast.error(r.error || "No se pudo guardar la respuesta.");
      }
    });
  }

  function handleSend() {
    if (!trimmed && status === currentStatus) {
      toast.error("Escribí una respuesta o cambiá el estado antes de enviar.");
      return;
    }
    if (needsConfirm) {
      setConfirmOpen(true);
      return;
    }
    submit();
  }

  return (
    <div className="space-y-4">
      {aiText ? (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Borrador sugerido por IA · todavía no se envió
            </p>
            <button
              type="button"
              onClick={() => setAiText("")}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Descartar borrador"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{aiText}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="subtle" onClick={() => useAiText("replace")}>
              <Check className="h-3.5 w-3.5" />
              Usar este texto
            </Button>
            {trimmed ? (
              <Button size="sm" variant="ghost" onClick={() => useAiText("append")}>
                <CornerDownLeft className="h-3.5 w-3.5" />
                Agregar al final
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <Label htmlFor="adminResponse">Respuesta visible para el cliente</Label>
          <Button variant="outline" size="sm" onClick={runAi} disabled={aiPending}>
            {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiPending ? "Generando…" : "Redactar con IA"}
          </Button>
        </div>
        <Textarea
          id="adminResponse"
          ref={textareaRef}
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hola, gracias por la consulta. Te confirmo disponibilidad, precios y una alternativa que puede convenirte…"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{savedResponse ? "Estás editando la respuesta ya enviada." : "Este texto también se publica en la conversación."}</span>
          <span className="tabular-nums">{text.length}/10000</span>
        </div>
      </div>

      <div>
        <Label htmlFor="status">Al enviar, dejar la solicitud como</Label>
        <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1">
          {ADMIN_ASSIGNABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REQUEST_STATUS_META[s].label}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{OUTCOME[status]}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
        {dirty ? <Badge tone="warning">Cambios sin enviar</Badge> : null}
        <Button onClick={handleSend} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {trimmed ? "Enviar respuesta al cliente" : "Actualizar estado"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        pending={saving}
        tone="destructive"
        title={status === "REJECTED" ? "Rechazar la solicitud" : "Cerrar la solicitud"}
        confirmLabel={status === "REJECTED" ? "Sí, rechazar" : "Sí, cerrar"}
        description={
          <>
            {OUTCOME[status]}{" "}
            {trimmed ? "Se le envía tu texto explicando la decisión." : "No escribiste ningún texto, así que solo va a ver el cambio de estado."}
          </>
        }
      />
    </div>
  );
}
