import { NextResponse } from "next/server";
import { parseHistoricalWorkbookFromBytes } from "@/lib/quote-history-parse";
import {
  authorizeHistoryIngest,
  ingestFail,
  persistHistoricalSheets,
  type IngestHistoricalResult,
} from "@/lib/quote-history-persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonResult(result: IngestHistoricalResult, status = 200) {
  return NextResponse.json(result, { status });
}

export async function POST(req: Request) {
  try {
    const authz = await authorizeHistoryIngest();
    if (!authz.ok) {
      return jsonResult(ingestFail(authz.error), 401);
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as {
        sourceFile?: string;
        sheets?: { sheetName?: string; lines?: { description?: string; quantity?: number | null }[] }[];
      } | null;
      if (!body || !Array.isArray(body.sheets)) {
        return jsonResult(ingestFail("No se recibieron hojas para ingestar."));
      }
      const result = await persistHistoricalSheets(body.sourceFile || "Planillas de Cotizacion.xlsx", body.sheets);
      return jsonResult(result, result.ok ? 200 : 400);
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return jsonResult(ingestFail("Subí el Excel de planillas."));
    }
    if (file.size > 40 * 1024 * 1024) {
      return jsonResult(ingestFail("El archivo supera los 40 MB. Dividí el Excel y subilo por partes."));
    }

    const parsed = parseHistoricalWorkbookFromBytes(
      await file.arrayBuffer(),
      "name" in file && typeof file.name === "string" ? file.name : "Planillas de Cotizacion.xlsx"
    );
    if (!parsed.ok) {
      return jsonResult(ingestFail(parsed.error, parsed.sheets, parsed.lines));
    }

    const result = await persistHistoricalSheets(parsed.sourceFile, parsed.sheets);
    return jsonResult(result, result.ok ? 200 : 400);
  } catch (error) {
    console.error("POST /api/admin/quotes/history/ingest", error);
    const detail = error instanceof Error ? error.message : "error desconocido";
    return jsonResult(ingestFail(`No se pudo ingestar el Excel (${detail}).`));
  }
}
