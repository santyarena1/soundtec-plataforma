"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  deleteShareablePriceList,
  duplicateShareablePriceList,
} from "@/server/actions/shareable-price-lists";

export function ShareListActions({ id, name, url }: { id: string; name: string; url: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            start(async () => {
              const r = await duplicateShareablePriceList(id);
              if (r.id) router.push("/admin/share-lists/" + r.id);
            })
          }
        >
          Duplicar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            window.open("https://wa.me/?text=" + encodeURIComponent(name + " " + url), "_blank")
          }
        >
          WhatsApp
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setConfirm(true)}
        >
          Eliminar
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        pending={pending}
        tone="destructive"
        title="¿Eliminar esta lista?"
        description="El link público dejará de funcionar y las vistas registradas se borrarán."
        confirmLabel="Eliminar"
        onConfirm={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("id", id);
            await deleteShareablePriceList(fd);
            setConfirm(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
