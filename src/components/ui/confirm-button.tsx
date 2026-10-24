"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  confirmMessage?: string;
  className?: string;
  variant?: "ghost" | "destructive" | "link";
}

/**
 * Botón submit que pide confirmación antes de ejecutar el `action` del <form>.
 * Pensado para acciones destructivas (eliminar, despublicar, dar de baja).
 */
export function ConfirmSubmit({
  children,
  confirmMessage = "¿Confirmás esta acción? Esta operación puede ser irreversible.",
  className,
  variant = "destructive",
}: Props) {
  const { pending } = useFormStatus();
  const confirmed = useRef(false);

  const base = "inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors disabled:opacity-50";
  const tone =
    variant === "destructive"
      ? "text-destructive hover:underline"
      : variant === "ghost"
        ? "text-muted-foreground hover:text-foreground"
        : "text-accent underline";

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        // Ya confirmado: sigue el envío normal del formulario.
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        e.preventDefault();
        const button = e.currentTarget;
        void confirmDialog(confirmMessage).then((ok) => {
          if (!ok) return;
          confirmed.current = true;
          button.form?.requestSubmit(button);
        });
      }}
      className={cn(base, tone, className)}
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
