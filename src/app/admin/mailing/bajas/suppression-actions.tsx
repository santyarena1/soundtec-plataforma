"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { addSuppressionsAction, removeSuppressionAction } from "@/server/actions/mailing-settings";

export function AddSuppressions() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"uno@empresa.com\notro@estudio.com.ar"} aria-label="Mails a suprimir" />
      <Input value={detail} maxLength={200} onChange={(e) => setDetail(e.target.value)} placeholder="Motivo (opcional): pidió la baja por WhatsApp" aria-label="Motivo" />
      <Button
        size="sm"
        disabled={busy || !text.trim()}
        onClick={() =>
          start(async () => {
            const result = await addSuppressionsAction({ text, detail });
            if (!result.ok) return void toast.error(result.error);
            toast.success(`${result.added} direcciones suprimidas.`);
            setText("");
            setDetail("");
            router.refresh();
          })
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
      </Button>
    </div>
  );
}

export function RemoveSuppression({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      title="Quitar de la supresión"
      aria-label={`Quitar ${email} de la supresión`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      onClick={async () => {
        const ok = await confirmDialog({ message: `¿Volver a mandarle campañas a ${email}?`, confirmLabel: "Quitar de la supresión" });
        if (!ok) return;
        start(async () => {
          const result = await removeSuppressionAction({ id });
          if (!result.ok) return void toast.error(result.error);
          router.refresh();
        });
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
    </button>
  );
}
