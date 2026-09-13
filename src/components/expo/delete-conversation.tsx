"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

/**
 * Borrar una conversación. Sirve sobre todo para sacar del medio las pruebas
 * propias, que si no quedan mezcladas con las consultas reales y ensucian los
 * contadores.
 */
export function DeleteConversation({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/ai/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [sessionId] }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        toast.error(data.error ?? "No se pudo borrar la conversación.");
        return;
      }
      toast.success("Conversación borrada.");
      router.push("/admin/assistant/conversations");
      router.refresh();
    } catch {
      toast.error("Se cortó la conexión.");
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" />
        Borrar
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Borrar esta conversación?"
        description="Se borran las preguntas, las respuestas y los datos de contacto que haya dejado. No se puede deshacer."
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={pending}>
            {pending ? "Borrando…" : "Borrar"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
