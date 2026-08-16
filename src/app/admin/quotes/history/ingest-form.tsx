"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ingestHistoricalWorkbook } from "@/server/actions/quote-history";

export function HistoryIngestForm() {
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
            setMsg(r.error || `Ingestadas ${r.sheets} hojas / ${r.lines} líneas. Los precios viejos no se usan.`);
          } catch (error) {
            setMsg(
              error instanceof Error
                ? `No se pudo ingestar: ${error.message}`
                : "No se pudo ingestar el Excel. Probá con un archivo más chico."
            );
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
