"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkAddToDraftSimple } from "@/server/actions/requests";

export function ShareListCta({
  mailto,
  productIds,
  canAdd,
}: {
  mailto: string;
  productIds: string[];
  canAdd: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={mailto}
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Pedir cotización de esta lista
      </a>
      {canAdd ? (
        <Button
          variant="outline"
          disabled={pending || !productIds.length}
          onClick={() =>
            start(async () => {
              const r = await bulkAddToDraftSimple(productIds);
              setMessage(
                r.ok
                  ? `Agregamos ${r.added} productos a tu pedido.`
                  : r.error || "No se pudieron agregar.",
              );
            })
          }
        >
          Agregar todo a mi pedido
        </Button>
      ) : null}
      {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
    </div>
  );
}
