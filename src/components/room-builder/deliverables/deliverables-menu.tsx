"use client";

/**
 * Entregables del proyecto o ambiente desde el panel (botón "Láminas PDF"):
 * - láminas en A3, Tabloid o ARCH D, con etiquetas F501 plana, bandera o
 *   autolaminable;
 * - revisión vigente y "Emitir revisión" (A, B, C… con estado de emisión),
 *   con el historial y la opción de anular la última;
 * - CSV de materiales (con o sin precios), CSV de planilla de cables (ID F501)
 *   y PNG del plano y del diagrama con cartela mínima.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, History, Image as ImageIcon, Loader2, Stamp } from "lucide-react";
import { toast } from "sonner";
import { getRoomProjectRevisions, issueRoomProjectRevision, removeRoomProjectRevision, type RevisionsState } from "@/server/actions/room-project-revisions";
import { cartelaRevision, REVISION_STATUS_LABEL, REVISION_STATUSES, revisionDate, type RevisionStatus } from "@/services/room-builder/revisions";
import { F501_VARIANTS, type F501Variant } from "@/services/room-builder/sheets/f501";
import { SHEET_FORMATS, SHEET_FORMAT_KEYS, type SheetFormatKey } from "@/services/room-builder/sheets/sheet-format";
import { downloadDrawingPngs } from "./svg-png";

export type SheetDownloadOptions = { format: SheetFormatKey; labels: F501Variant };

type Props = {
  projectId: string;
  /** Genera y baja las láminas (el editor suma las vistas 3D antes de pedirlas). */
  onDownloadSheets: (opts: SheetDownloadOptions) => Promise<void>;
  busy?: boolean;
  /** Botón más bajo para la barra del editor. */
  compact?: boolean;
};

const selectCls = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800";
const itemCls = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50";

export function DeliverablesMenu({ projectId, onDownloadSheets, busy = false, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<SheetFormatKey>("a3");
  const [labels, setLabels] = useState<F501Variant>("plana");
  const [revs, setRevs] = useState<RevisionsState | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [status, setStatus] = useState<RevisionStatus>("preliminar");
  const [description, setDescription] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Revisiones: se leen al abrir el menú (y después de emitir o anular).
  useEffect(() => {
    if (!open || revs) return;
    start(async () => {
      const res = await getRoomProjectRevisions(projectId);
      if (res.ok) setRevs(res.state);
      else toast.error(res.error);
    });
  }, [open, revs, projectId]);

  // Se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = cartelaRevision(revs?.list ?? []);
  const base = `/api/admin/room-builder/projects/${projectId}/exports`;

  function issue() {
    start(async () => {
      const res = await issueRoomProjectRevision({ projectId, status, description });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRevs(res.state);
      setIssuing(false);
      setDescription("");
      const last = res.state.list[res.state.list.length - 1];
      toast.success(`Revisión ${last?.code ?? ""} emitida: ${last ? REVISION_STATUS_LABEL[last.status] : ""}`);
    });
  }

  function removeLast(code: string) {
    if (!window.confirm(`¿Anular la revisión ${code}? Las láminas vuelven a la anterior.`)) return;
    start(async () => {
      const res = await removeRoomProjectRevision(projectId, code);
      if (!res.ok) toast.error(res.error);
      else {
        setRevs(res.state);
        toast.success(`Revisión ${code} anulada`);
      }
    });
  }

  async function run(key: string, job: () => Promise<void>) {
    setWorking(key);
    try {
      await job();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setWorking(null);
    }
  }

  /** CSV: navegación directa (el servidor manda el adjunto con nombre). */
  const csv = (kind: string, extra = "") => {
    window.location.href = `${base}?kind=${kind}${extra}`;
  };

  const png = (kind: "plan" | "diagram") =>
    run(kind, async () => {
      const n = await downloadDrawingPngs(`${base}?kind=drawings`, kind);
      if (n) toast.success(n === 1 ? "PNG descargado" : `${n} PNG descargados`);
      else toast.message(kind === "plan" ? "No hay plano para exportar" : "No hay diagrama: falta trazar el cableado");
    });

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[#1e3553] bg-white font-semibold text-[#1e3553] disabled:opacity-60 ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-1.5 text-xs"}`}
        title="Láminas técnicas (A3, Tabloid o ARCH D), revisiones, CSV y PNG"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        Láminas PDF
        {revs?.list.length ? <span className="rounded bg-[#1e3553] px-1 text-[10px] text-white">Rev. {current.code}</span> : null}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-80 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
          <section className="space-y-2">
            <p className="font-semibold uppercase tracking-wider text-slate-500">Láminas</p>
            <label className="block space-y-1">
              <span className="text-slate-600">Formato de hoja</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as SheetFormatKey)} className={selectCls}>
                {SHEET_FORMAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SHEET_FORMATS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600">Etiquetas de cable (AVIXA F501)</span>
              <select value={labels} onChange={(e) => setLabels(e.target.value as F501Variant)} className={selectCls}>
                {(Object.keys(F501_VARIANTS) as F501Variant[]).map((k) => (
                  <option key={k} value={k}>
                    {F501_VARIANTS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                void onDownloadSheets({ format, labels });
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#1e3553] px-2.5 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> Descargar láminas · Rev. {current.code}
            </button>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold uppercase tracking-wider text-slate-500">Revisión</p>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
            </div>
            <p className="text-slate-700">
              Vigente: <b>Rev. {current.code}</b> · {current.status}
              {revs?.inherited ? <span className="text-slate-500"> (del proyecto)</span> : null}
            </p>
            {issuing ? (
              <div className="space-y-2 rounded-lg bg-slate-50 p-2">
                <label className="block space-y-1">
                  <span className="text-slate-600">Estado de emisión</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value as RevisionStatus)} className={selectCls}>
                    {REVISION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {REVISION_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-slate-600">Qué cambió</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="Ej.: se suma la cámara de la sala B; cambian los largos de HDMI." className={selectCls} />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={issue} disabled={pending || !description.trim()} className="flex-1 rounded-md bg-[#1e3553] px-2 py-1.5 font-semibold text-white disabled:opacity-50">
                    Emitir revisión
                  </button>
                  <button type="button" onClick={() => setIssuing(false)} className="rounded-md border border-slate-300 px-2 py-1.5 text-slate-600">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setIssuing(true)} className={itemCls}>
                <Stamp className="h-3.5 w-3.5 text-[#1e3553]" /> Emitir nueva revisión
              </button>
            )}
            {revs?.list.length ? (
              <ol className="max-h-36 space-y-1 overflow-auto">
                {[...revs.list].reverse().map((r, i) => (
                  <li key={r.code} className="flex items-start gap-2 rounded-md border border-slate-100 px-2 py-1">
                    <History className="mt-0.5 h-3 w-3 flex-none text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p>
                        <b>{r.code}</b> · {REVISION_STATUS_LABEL[r.status]} · <span className="text-slate-500">{revisionDate(r.date)}</span>
                      </p>
                      <p className="truncate text-slate-500" title={r.description}>
                        {r.description} — {r.author}
                      </p>
                    </div>
                    {i === 0 && !revs.inherited ? (
                      <button type="button" onClick={() => removeLast(r.code)} className="text-[11px] text-rose-700 hover:underline" disabled={pending}>
                        Anular
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <section className="space-y-1 border-t border-slate-100 pt-3">
            <p className="mb-1 font-semibold uppercase tracking-wider text-slate-500">Exportar</p>
            <button type="button" className={itemCls} onClick={() => csv("bom")}>
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Lista de materiales (CSV, sin precios)
            </button>
            <button type="button" className={itemCls} onClick={() => csv("bom", "&prices=1")} title="Con precio de venta unitario y subtotal (solo si tu usuario ve precios)">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Lista de materiales con precios (CSV)
            </button>
            <button type="button" className={itemCls} onClick={() => csv("cables")}>
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Planilla de cables F501 (CSV)
            </button>
            <button type="button" className={itemCls} disabled={working !== null} onClick={() => void png("plan")}>
              {working === "plan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 text-sky-700" />} Plano (PNG)
            </button>
            <button type="button" className={itemCls} disabled={working !== null} onClick={() => void png("diagram")}>
              {working === "diagram" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 text-sky-700" />} Diagrama de conexiones (PNG)
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
