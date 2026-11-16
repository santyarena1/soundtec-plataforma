"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { deleteList } from "@/server/actions/mailing-lists";

export function ListRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const icon = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <Link href={`/admin/mailing/listas/${id}`} className={icon} title="Ver" aria-label="Ver lista">
        <Eye className="h-4 w-4" />
      </Link>
      <button
        type="button"
        className={icon}
        disabled={busy}
        title="Borrar"
        aria-label="Borrar lista"
        onClick={async () => {
          const ok = await confirmDialog({ message: `¿Borrar la lista «${name}»? Las campañas ya enviadas no cambian.`, confirmLabel: "Borrar", tone: "danger" });
          if (!ok) return;
          start(async () => {
            const result = await deleteList({ id });
            if (!result.ok) return void toast.error(result.error);
            toast.success("Lista borrada.");
            router.push("/admin/mailing/listas");
            router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
