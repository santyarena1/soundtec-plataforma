"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Copy, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { createForm, deleteForm, duplicateForm } from "@/server/actions/forms";

export function formPublicUrl(token: string): string {
  return `${window.location.origin}/f/${token}`;
}

export async function copyFormLink(token: string) {
  try {
    await navigator.clipboard.writeText(formPublicUrl(token));
    toast.success("Enlace copiado.", { description: "Cualquiera que lo tenga puede responder mientras esté abierto." });
  } catch {
    toast.error("No se pudo copiar. Copialo a mano desde el editor.");
  }
}

export function CreateFormButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await createForm({ title: "Formulario nuevo" });
          if (!result.ok) return void toast.error(result.error);
          router.push(`/admin/forms/${result.formId}`);
        })
      }
    >
      <Plus className="h-4 w-4" /> Nuevo formulario
    </Button>
  );
}

export function FormRowActions({ formId, token }: { formId: string; token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const icon = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50";
  return (
    <div className="flex items-center gap-0.5">
      <Link href={`/admin/forms/${formId}`} className={icon} title="Editar" aria-label="Editar">
        <Pencil className="h-4 w-4" />
      </Link>
      <button type="button" className={icon} title="Copiar enlace" aria-label="Copiar enlace" onClick={() => void copyFormLink(token)}>
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={icon}
        title="Duplicar"
        aria-label="Duplicar"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await duplicateForm({ formId });
            if (!result.ok) return void toast.error(result.error);
            toast.success("Formulario duplicado como borrador.");
            router.push(`/admin/forms/${result.formId}`);
          })
        }
      >
        <CopyPlus className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${icon} hover:text-destructive`}
        title="Eliminar"
        aria-label="Eliminar"
        disabled={pending}
        onClick={async () => {
          const ok = await confirmDialog({ message: "¿Eliminar el formulario y todas sus respuestas? No se puede deshacer.", tone: "danger", confirmLabel: "Eliminar" });
          if (!ok) return;
          start(async () => {
            const result = await deleteForm({ formId });
            if (!result.ok) return void toast.error(result.error);
            toast.success("Formulario eliminado.");
            router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
