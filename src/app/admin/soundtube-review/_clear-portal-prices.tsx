"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { clearSoundTubePortalPrices } from "@/server/actions/soundtube-price-list";

/** Quita ya los precios que vinieron del portal de SoundTube (quedan "a consultar"). */
export function ClearPortalPrices() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/40 p-3 text-xs">
      <p className="max-w-2xl text-muted-foreground">
        Los precios de SoundTube salen solo de esta lista. Los productos del portal que no están en la lista quedan sin precio
        («a consultar»). El sync lo hace en cada corrida; si querés aplicarlo ya:
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await clearSoundTubePortalPrices();
            setMessage(r.ok ? { ok: true, text: r.cleared ? `${r.cleared} productos quedaron sin precio.` : "No había precios del portal para quitar." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Aplicando…" : "Quitar precios del portal ahora"}
      </Button>
      {message ? <span className={message.ok ? "text-emerald-700" : "text-destructive"}>{message.text}</span> : null}
    </div>
  );
}
