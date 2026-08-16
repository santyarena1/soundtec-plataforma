"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { chunkHistoricalSheets, type IngestHistoricalResult } from "@/lib/quote-history-parse";

function fail(error: string, sheets = 0, lines = 0): IngestHistoricalResult {
  return { ok: false, error, sheets, lines };
}

async function readApiResult(res: Response): Promise<IngestHistoricalResult> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as IngestHistoricalResult;
    if (json && typeof json === "object") {
      if (json.error) return { ok: Boolean(json.ok), error: json.error, sheets: json.sheets ?? 0, lines: json.lines ?? 0 };
      if (!res.ok) {
        return fail(`HTTP ${res.status}: ${text.slice(0, 180) || "sin cuerpo"}`, json.sheets, json.lines);
      }
      return { ok: Boolean(json.ok), sheets: json.sheets ?? 0, lines: json.lines ?? 0, error: json.error };
    }
  } catch {
    /* HTML / 413 / timeout de Vercel */
  }
  const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  if (res.status === 413) {
    return fail("El lote es demasiado grande para el servidor (HTTP 413).");
  }
  return fail(`HTTP ${res.status}: ${snippet || "respuesta no JSON del servidor"}`);
}

async function postSheetBatch(payload: {
  sourceFile: string;
  sheets: unknown;
  resetSource?: boolean;
}): Promise<IngestHistoricalResult> {
  let res: Response;
  try {
    res = await fetch("/api/admin/quotes/history/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error de red";
    return fail(`No se pudo contactar al servidor (${message}).`);
  }
  return readApiResult(res);
}

async function ingestHistoricalWorkbook(
  fd: FormData,
  onProgress: (msg: string) => void
): Promise<IngestHistoricalResult> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Subí el Excel de planillas.");
  }
  if (file.size > 40 * 1024 * 1024) {
    return fail("El archivo supera los 40 MB. Dividí el Excel y subilo por partes.");
  }

  onProgress(`Leyendo ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) en el navegador…`);

  let parsed: Awaited<ReturnType<typeof import("@/lib/quote-history-parse").parseHistoricalWorkbookFromBytes>>;
  try {
    const { parseHistoricalWorkbookFromBytes } = await import("@/lib/quote-history-parse");
    parsed = parseHistoricalWorkbookFromBytes(await file.arrayBuffer(), file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error al parsear";
    return fail(`No se pudo parsear el Excel en el navegador (${message}).`);
  }

  if (!parsed.ok) {
    return fail(parsed.error, parsed.sheets ?? 0, parsed.lines ?? 0);
  }

  const batches = chunkHistoricalSheets(parsed.sheets);
  let sheets = 0;
  let lines = 0;

  for (let i = 0; i < batches.length; i++) {
    onProgress(`Enviando lote ${i + 1}/${batches.length} (${parsed.sheets.length} hojas parseadas)…`);
    const r = await postSheetBatch({
      sourceFile: parsed.sourceFile,
      sheets: batches[i],
      resetSource: i === 0,
    });
    if (!r.ok) {
      return fail(
        `Lote ${i + 1}/${batches.length}: ${r.error || "error sin detalle"}`,
        sheets + (r.sheets ?? 0),
        lines + (r.lines ?? 0)
      );
    }
    sheets += r.sheets ?? 0;
    lines += r.lines ?? 0;
  }

  return { ok: true, sheets, lines };
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
          const r = await ingestHistoricalWorkbook(fd, setMsg);
          if (r.ok) {
            setMsg(`Ingestadas ${r.sheets ?? 0} hojas / ${r.lines ?? 0} líneas. Los precios viejos no se usan.`);
            router.refresh();
            return;
          }
          setMsg(r.error || `Falló la ingesta (HTTP/parse) · hojas ${r.sheets ?? 0} · líneas ${r.lines ?? 0}.`);
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
