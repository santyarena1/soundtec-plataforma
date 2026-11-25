"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CloudDownload } from "lucide-react";
import { refreshFromResendAction } from "@/server/actions/mailing-sent";

/** Consulta en Resend el último evento de los enviados sin confirmar (hasta 40 por clic). */
export function RefreshFromResendButton({ campaignId, disabled }: { campaignId: string | null; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || disabled}
      title={disabled ? "Hace falta la API key de Resend y que no esté en modo prueba." : "Consulta en Resend el estado de los mails sin entrega confirmada (últimos 30 días)."}
      onClick={() =>
        start(async () => {
          const result = await refreshFromResendAction({ campaignId });
          if (!result.ok) return void toast.error(result.error);
          const more = result.remaining ? ` Quedan ${result.remaining.toLocaleString("es-AR")} por revisar: tocá de nuevo.` : "";
          toast.success(result.checked ? `Se revisaron ${result.checked} y se actualizaron ${result.updated}.${more}` : "No hay envíos sin confirmar para revisar.");
          router.refresh();
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"
    >
      <CloudDownload className="h-4 w-4" />
      {pending ? "Consultando Resend…" : "Traer de Resend"}
    </button>
  );
}
