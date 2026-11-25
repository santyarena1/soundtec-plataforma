"use client";

import { useTransition } from "react";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startImpersonation } from "@/server/actions/impersonation";
import { cn } from "@/lib/utils";

interface ViewAsButtonProps {
  userId: string;
  name: string;
  /** Solo el ojo (listas compactas). */
  compact?: boolean;
  className?: string;
}

/** Ojo «Ver como este usuario»: abre una vista de solo lectura por 30 minutos. Solo se muestra a admins. */
export function ViewAsButton({ userId, name, compact = false, className }: ViewAsButtonProps) {
  const [pending, start] = useTransition();
  const label = `Ver como ${name}`;

  function onClick() {
    start(async () => {
      const fd = new FormData();
      fd.set("userId", userId);
      try {
        // Si sale bien, redirige (no vuelve): solo queda manejar el error.
        const res = await startImpersonation(fd);
        if (res && !res.ok) toast.error(res.error);
      } catch (error) {
        // El redirect de Next se propaga como excepción especial: no es un error.
        if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
        toast.error("No se pudo abrir la vista. Probá de nuevo.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={`${label}: ves lo mismo que ve, en solo lectura (30 min)`}
      aria-label={label}
      data-testid="ver-como-boton"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-card text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
        compact ? "h-7 w-7 justify-center" : "h-9 px-3",
        className
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      {compact ? null : "Ver como este usuario"}
    </button>
  );
}
