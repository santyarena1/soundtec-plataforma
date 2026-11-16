"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BarChart3, Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { createCampaign, deleteCampaign, duplicateCampaign } from "@/server/actions/mailing";

export function NewCampaignButton() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      disabled={busy}
      onClick={() =>
        start(async () => {
          const result = await createCampaign({});
          if (!result.ok) return void toast.error(result.error);
          router.push(`/admin/mailing/${result.id}`);
        })
      }
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nueva campaña
    </Button>
  );
}

export function DuplicateCampaignButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const result = await duplicateCampaign({ id });
          if (!result.ok) return void toast.error(result.error);
          toast.success("Campaña duplicada: quedó como borrador.");
          router.push(`/admin/mailing/${result.id}`);
        })
      }
    >
      <Copy className="h-4 w-4" /> Duplicar
    </Button>
  );
}

export function CampaignRowActions({ id, editable, sending }: { id: string; editable: boolean; sending: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const icon = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <Link href={`/admin/mailing/${id}`} className={icon} title={editable ? "Editar" : "Ver resultados"} aria-label={editable ? "Editar" : "Ver resultados"}>
        {editable ? <Pencil className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
      </Link>
      <button
        type="button"
        className={icon}
        disabled={busy}
        title="Duplicar"
        aria-label="Duplicar"
        onClick={() =>
          start(async () => {
            const result = await duplicateCampaign({ id });
            if (!result.ok) return void toast.error(result.error);
            toast.success("Campaña duplicada: quedó como borrador.");
            router.push(`/admin/mailing/${result.id}`);
          })
        }
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={icon}
        disabled={busy || sending}
        title="Borrar"
        aria-label="Borrar"
        onClick={async () => {
          const ok = await confirmDialog({ message: "¿Borrar la campaña? También se borran sus resultados.", confirmLabel: "Borrar", tone: "danger" });
          if (!ok) return;
          start(async () => {
            const result = await deleteCampaign({ id });
            if (!result.ok) return void toast.error(result.error);
            router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
