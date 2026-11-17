"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input, Label } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { HTML_HELP, HtmlImporter } from "@/components/mailing/html-tools";
import { deleteTemplate, duplicateTemplate, importTemplate } from "@/server/actions/mailing-templates";

export function TemplateImportPanel() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{HTML_HELP}</p>
      <HtmlImporter
        label="Importar plantilla"
        extra={
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Newsletter Sonance verano" />
            </div>
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Diseño de la agencia, 600 px" />
            </div>
          </div>
        }
        submit={async (data) => {
          data.set("name", name);
          data.set("description", description);
          const result = await importTemplate(data);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(`Plantilla importada${result.uploaded ? ` · ${result.uploaded} imágenes subidas` : ""}.`);
          setName("");
          setDescription("");
          router.push(`/admin/mailing/plantillas/${result.id}`);
          return true;
        }}
      />
    </div>
  );
}

export function TemplateRowActions({ id, name, afterDelete = "refresh" }: { id: string; name: string; afterDelete?: "refresh" | "list" }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const icon = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        className={icon}
        disabled={busy}
        title="Duplicar"
        aria-label={`Duplicar ${name}`}
        onClick={() =>
          start(async () => {
            const result = await duplicateTemplate({ id });
            if (!result.ok) return void toast.error(result.error);
            toast.success("Plantilla duplicada.");
            router.push(`/admin/mailing/plantillas/${result.id}`);
          })
        }
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={icon}
        disabled={busy}
        title="Borrar"
        aria-label={`Borrar ${name}`}
        onClick={async () => {
          const ok = await confirmDialog({ message: `¿Borrar la plantilla «${name}»? Las campañas que ya la usan tienen su propia copia y no cambian.`, confirmLabel: "Borrar", tone: "danger" });
          if (!ok) return;
          start(async () => {
            await deleteTemplate({ id });
            toast.success("Plantilla borrada.");
            if (afterDelete === "list") router.push("/admin/mailing/plantillas");
            router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
