"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmación del sistema (reemplaza al cuadro gris del navegador):
 *
 *   if (!(await confirmDialog("¿Eliminar la cotización?"))) return;
 *   if (!(await confirmDialog({ title: "Eliminar", message: "…", confirmLabel: "Eliminar", tone: "danger" }))) return;
 *
 * Se muestra con la estética del sistema, texto grande y botones claros.
 * Si por algún motivo no está montado el host, cae al confirm del navegador.
 */

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** «danger» = acción que borra o no se puede deshacer (botón rojo). */
  tone?: "danger" | "default";
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((request: Request) => void) | null = null;

const looksDestructive = (text: string) => /eliminar|borrar|quitar|desactivar|descartar|reemplaz|no se puede deshacer/i.test(text);

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const options: ConfirmOptions = typeof input === "string" ? { message: input } : input;
  if (!show) return Promise.resolve(typeof window !== "undefined" ? window.confirm(options.message) : false);
  return new Promise((resolve) => show!({ ...options, resolve }));
}

/** Se monta una vez (en Providers). */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);

  useEffect(() => {
    show = (next) => setRequest(next);
    return () => {
      show = null;
    };
  }, []);

  if (!request) return null;
  const danger = request.tone ? request.tone === "danger" : looksDestructive(`${request.title ?? ""} ${request.message}`);
  const close = (ok: boolean) => {
    request.resolve(ok);
    setRequest(null);
  };

  return (
    <Modal
      open
      onClose={() => close(false)}
      title={request.title ?? (danger ? "¿Seguro?" : "Confirmar")}
      icon={danger ? <AlertTriangle className="h-5 w-5 text-destructive" /> : undefined}
      size="sm"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => close(false)} className="h-11 sm:h-10">
            {request.cancelLabel ?? "Cancelar"}
          </Button>
          <Button type="button" variant={danger ? "destructive" : "primary"} onClick={() => close(true)} autoFocus className="h-11 sm:h-10">
            {request.confirmLabel ?? (danger ? "Sí, continuar" : "Confirmar")}
          </Button>
        </div>
      }
    >
      <p className="whitespace-pre-line text-base leading-relaxed">{request.message}</p>
    </Modal>
  );
}
