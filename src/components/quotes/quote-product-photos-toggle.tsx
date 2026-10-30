"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";
import { setQuoteProductPhotos } from "@/server/actions/quotes";

/** Tilde para que las fotos de los productos salgan o no en el PDF de esta cotización. */
export function QuoteProductPhotosToggle({ quoteId, checked, readOnly }: { quoteId: string; checked: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <input
        type="checkbox"
        defaultChecked={checked}
        disabled={readOnly || pending}
        onChange={(e) => {
          const show = e.target.checked;
          start(async () => {
            const result = await setQuoteProductPhotos({ quoteId, show });
            if (!result.ok) return void toast.error(result.error || "No se pudo guardar.");
            toast.success(show ? "Las fotos van en el PDF." : "El PDF sale sin fotos.");
            router.refresh();
          });
        }}
      />
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
      Mostrar las fotos de los productos en el PDF
    </label>
  );
}
