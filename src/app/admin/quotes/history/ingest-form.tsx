"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ingestHistoricalWorkbook } from "@/server/actions/quote-history";

export function HistoryIngestForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            const r = await ingestHistoricalWorkbook(fd);
            if (!r?.ok) {
              setMsg(r?.error || "No se pudo ingestar el Excel.");
              return;
            }
            setMsg(`Ingestadas ${r.sheets ?? 0} hojas / ${r.lines ?? 0} líneas. Los precios viejos no se usan.`);
            router.refresh();
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (!message || /NEXT_REDIRECT|reading ['"]error['"]/i.test(message)) {
              setMsg("No se pudo ingestar el Excel. Probá con un archivo más chico.");
              return;
            }
            setMsg(`No se pudo ingestar: ${message}`);
          }
        });
      }}
    >
      <input name="file" type="file" accept=".xlsx,.xls" required className="text-sm" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Leyendo…" : "Ingestar planillas"}
      </Button>
      {msg ? <p className="w-full text-sm text-muted-foreground">{msg}</p> : null}
    </form>
  );
}
