import { NextResponse } from "next/server";
import {
  parseHistoricalWorkbookFromBytes,
  type ParsedHistoricalSheet,
} from "@/lib/quote-history-parse";
import {
  authorizeHistoryIngest,
  ingestFail,
  persistHistoricalSheets,
  type IngestHistoricalResult,
} from "@/lib/quote-history-persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VERCEL_SAFE_UPLOAD = 3.5 * 1024 * 1024;

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
      const body = (await req.json().catch((error) => {
        const detail = error instanceof Error ? error.message : "JSON inválido";
        return { __parseError: detail };
      })) as {
        __parseError?: string;
        sourceFile?: string;
        resetSource?: boolean;
        sheets?: { sheetName?: string; lines?: { description?: string; quantity?: number | null }[] }[];
      };

      if (body && body.__parseError) {
        return jsonResult(ingestFail(`No se pudo leer el JSON (${body.__parseError}).`));
      }
      if (!body || !Array.isArray(body.sheets)) {
        return jsonResult(ingestFail("No se recibieron hojas para ingestar."));
      }
      const sheets: ParsedHistoricalSheet[] = body.sheets.map((sheet) => ({
        sheetName: String(sheet?.sheetName || "").trim(),
        lines: Array.isArray(sheet?.lines)
          ? sheet.lines.map((line) => ({
              description: String(line?.description || "").trim(),
              quantity:
                typeof line?.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : null,
            }))
          : [],
      }));
      const result = await persistHistoricalSheets(
        body.sourceFile || "Planillas de Cotizacion.xlsx",
        sheets,
        { resetSource: body.resetSource === true }
      );
      return jsonResult(result, result.ok ? 200 : 400);
    }

    const form = await req.formData().catch((error) => {
      const detail = error instanceof Error ? error.message : "formData ilegible";
      throw new Error(`No se pudo leer el archivo (${detail}).`);
    });
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return jsonResult(ingestFail("Subí el Excel de planillas."));
    }
    if (file.size > VERCEL_SAFE_UPLOAD) {
      return jsonResult(
        ingestFail(
          `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Vercel corta uploads > 4.5 MB; recargá y usá el parseo en el navegador (lotes JSON).`
        )
      );
    }

    const parsed = parseHistoricalWorkbookFromBytes(
      await file.arrayBuffer(),
      "name" in file && typeof file.name === "string" ? file.name : "Planillas de Cotizacion.xlsx"
    );
    if (!parsed.ok) {
      return jsonResult(ingestFail(parsed.error, parsed.sheets, parsed.lines));
    }

    const result = await persistHistoricalSheets(parsed.sourceFile, parsed.sheets, { resetSource: true });
    return jsonResult(result, result.ok ? 200 : 400);
  } catch (error) {
    console.error("POST /api/admin/quotes/history/ingest", error);
    const detail = error instanceof Error ? error.message : "error desconocido";
    return jsonResult(ingestFail(`No se pudo ingestar el Excel (${detail}).`));
  }
}
