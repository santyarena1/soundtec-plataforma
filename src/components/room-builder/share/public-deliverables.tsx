"use client";

/**
 * Descargas del enlace del cliente: láminas PDF en el formato de hoja que
 * elija (A3, Tabloid o ARCH D), lista de materiales y planilla de cables en
 * CSV (sin precios) y PNG del plano y del diagrama con la cartela de la
 * empresa. Todo sale de /p/[token]/… (sin rutas del panel).
 */

import { useState } from "react";
import { Download, FileSpreadsheet, Image as ImageIcon, Loader2 } from "lucide-react";
import { SHEET_FORMATS, SHEET_FORMAT_KEYS, type SheetFormatKey } from "@/services/room-builder/sheets/sheet-format";
import { downloadDrawingPngs } from "../deliverables/svg-png";

const linkCls = "inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

export function PublicDeliverables({ token, revision }: { token: string; revision: { code: string; status: string } }) {
  const [format, setFormat] = useState<SheetFormatKey>("a3");
  const [working, setWorking] = useState<"plan" | "diagram" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/p/${token}`;

  async function png(kind: "plan" | "diagram") {
    setWorking(kind);
    setError(null);
    try {
      const n = await downloadDrawingPngs(`${base}/exportar?kind=drawings`, kind);
      if (!n) setError(kind === "plan" ? "Todavía no hay plano para descargar." : "Todavía no hay diagrama de conexiones.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar la imagen.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg bg-[#1e3553] text-white">
          <a href={`${base}/laminas?formato=${format}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-[#16283f]">
            <Download className="h-4 w-4" /> Descargar láminas PDF
          </a>
          <label className="flex items-center border-l border-white/20 px-2">
            <span className="sr-only">Formato de hoja</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as SheetFormatKey)} className="bg-transparent py-2 text-xs font-medium text-white outline-none [&>option]:text-slate-900">
              {SHEET_FORMAT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SHEET_FORMATS[k].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
          Rev. {revision.code} · {revision.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`${base}/exportar?kind=bom`} className={linkCls}>
          <FileSpreadsheet className="h-4 w-4 text-emerald-700" /> Materiales (CSV)
        </a>
        <a href={`${base}/exportar?kind=cables`} className={linkCls}>
          <FileSpreadsheet className="h-4 w-4 text-emerald-700" /> Planilla de cables (CSV)
        </a>
        <button type="button" onClick={() => void png("plan")} disabled={working !== null} className={linkCls}>
          {working === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4 text-sky-700" />} Plano (PNG)
        </button>
        <button type="button" onClick={() => void png("diagram")} disabled={working !== null} className={linkCls}>
          {working === "diagram" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4 text-sky-700" />} Diagrama (PNG)
        </button>
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
