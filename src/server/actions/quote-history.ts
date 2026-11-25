"use server";

import { parseHistoricalWorkbookFromBytes } from "@/lib/quote-history-parse";
import type { IngestHistoricalResult } from "@/lib/quote-history-parse";
import { authorizeHistoryIngest, ingestFail, persistHistoricalSheets } from "@/lib/quote-history-persist";

export type { IngestHistoricalResult };

export async function ingestHistoricalWorkbook(formData: FormData): Promise<IngestHistoricalResult> {
  try {
    const authz = await authorizeHistoryIngest();
    if (!authz.ok) return ingestFail(authz.error);

    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return ingestFail("Subí el Excel de planillas.");
    }
    if (file.size > 40 * 1024 * 1024) {
      return ingestFail("El archivo supera los 40 MB. Dividí el Excel y subilo por partes.");
    }

    const parsed = parseHistoricalWorkbookFromBytes(
      await file.arrayBuffer(),
      "name" in file && typeof file.name === "string" ? file.name : "Planillas de Cotizacion.xlsx"
    );
    if (!parsed.ok) {
      return ingestFail(parsed.error, parsed.sheets, parsed.lines);
    }

    return persistHistoricalSheets(parsed.sourceFile, parsed.sheets);
  } catch (error) {
    console.error("ingestHistoricalWorkbook", error);
    const detail = error instanceof Error ? error.message : "error desconocido";
    if (/NEXT_REDIRECT/i.test(detail) || (typeof error === "object" && error && "digest" in error)) {
      return ingestFail("No tenés permiso para ingestar planillas históricas.");
    }
    return ingestFail(`No se pudo ingestar el Excel (${detail}).`);
  }
}
