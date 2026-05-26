"use client";

import { useFormStatus } from "react-dom";
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
        if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={cn(base, tone, className)}
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
