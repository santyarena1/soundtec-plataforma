"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { deleteFormResponse } from "@/server/actions/forms";

export function DeleteResponseButton({ responseId }: { responseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Borrar esta respuesta"
      aria-label="Borrar esta respuesta"
      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      onClick={async () => {
        const ok = await confirmDialog({ message: "¿Borrar esta respuesta? No se puede deshacer.", tone: "danger", confirmLabel: "Borrar" });
        if (!ok) return;
        start(async () => {
          const result = await deleteFormResponse({ responseId });
          if (!result.ok) return void toast.error(result.error);
          router.refresh();
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
