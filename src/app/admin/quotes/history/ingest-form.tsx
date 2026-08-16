"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { IngestHistoricalResult } from "@/lib/quote-history-parse";

const FAIL_MSG = "No se pudo ingestar. Reintentá o pedile al admin permiso de biblioteca.";

async function ingestHistoricalWorkbook(fd: FormData): Promise<IngestHistoricalResult | null> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Subí el Excel de planillas." };
  }
  if (file.size > 40 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera los 40 MB. Dividí el Excel y subilo por partes." };
  }

  try {
    let payload: { sourceFile: string; sheets: unknown } | null = null;
    try {
      const { parseHistoricalWorkbookFromBytes } = await import("@/lib/quote-history-parse");
      const parsed = parseHistoricalWorkbookFromBytes(await file.arrayBuffer(), file.name);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, sheets: parsed.sheets ?? 0, lines: parsed.lines ?? 0 };
      }
      payload = { sourceFile: parsed.sourceFile, sheets: parsed.sheets };
    } catch {
      payload = null;
    }

    const res = payload
      ? await fetch("/api/admin/quotes/history/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/quotes/history/ingest", { method: "POST", body: fd });
    const r = (await res.json().catch(() => null)) as IngestHistoricalResult | null;
    if (r) return r;
    if (!res.ok) {
      return { ok: false, error: res.status === 413 ? "El archivo es demasiado grande para el servidor." : FAIL_MSG };
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message || /NEXT_REDIRECT|reading ['"`]error['"`]/i.test(message)) {
      return null;
    }
    return { ok: false, error: `No se pudo ingestar: ${message}` };
  }
}

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
          const r = await ingestHistoricalWorkbook(fd);
          if (!r) {
            setMsg(FAIL_MSG);
            return;
          }
          setMsg(r.error || `Ingestadas ${r.sheets} hojas / ${r.lines} líneas. Los precios viejos no se usan.`);
          if (r.ok) router.refresh();
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
