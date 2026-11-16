"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ColumnMapping } from "@/lib/mailing/import";
import { variableKey } from "@/lib/mailing/variables";
import { importList, previewImport } from "@/server/actions/mailing-lists";

type Preview = { headers: string[]; sample: string[][]; totalRows: number; mapping: ColumnMapping };
type Done = { added: number; updated: number; invalid: number; duplicates: number; invalidSamples: string[] };

/**
 * Importar un Excel/CSV: 1) subir, 2) decir qué columna es el mail, el nombre
 * y la empresa (viene adivinado), 3) elegir columnas extra como variables,
 * 4) lista nueva o sumar a una existente.
 */
export function ImportWizard({ targets, fixedListId, onDone }: { targets: Array<{ id: string; name: string }>; fixedListId?: string; onDone?: (listId: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(fixedListId ?? "");
  const [done, setDone] = useState<Done | null>(null);
  const [busy, start] = useTransition();

  function pick(selected: File) {
    setDone(null);
    start(async () => {
      const data = new FormData();
      data.set("file", selected);
      const result = await previewImport(data);
      if (fileRef.current) fileRef.current.value = "";
      if (!result.ok) return void toast.error(result.error);
      setFile(selected);
      setPreview(result);
      setMapping(result.mapping);
      setName(selected.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120));
    });
  }

  function run() {
    if (!file || !mapping) return;
    start(async () => {
      const data = new FormData();
      data.set("file", file);
      data.set("mapping", JSON.stringify(mapping));
      if (target) data.set("listId", target);
      else data.set("name", name);
      const result = await importList(data);
      if (!result.ok) return void toast.error(result.error);
      setDone(result);
      setPreview(null);
      setFile(null);
      toast.success(`${result.added.toLocaleString("es-AR")} personas cargadas.`);
      onDone?.(result.id);
    });
  }

  const columnSelect = (key: "email" | "name" | "lastName" | "company", label: string, required = false) =>
    preview && mapping ? (
      <div className="space-y-1">
        <Label required={required}>{label}</Label>
        <Select value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value), extras: mapping.extras.filter((c) => c !== Number(e.target.value)) })}>
          {!required ? <option value={-1}>— no hay —</option> : null}
          {preview.headers.map((h, i) => (
            <option key={i} value={i}>
              {h}
            </option>
          ))}
        </Select>
      </div>
    ) : null;

  const used = mapping ? new Set([mapping.email, mapping.name, mapping.lastName, mapping.company]) : new Set<number>();

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      {!preview ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-primary" />}
          <span className="font-semibold text-foreground">Elegí el Excel o CSV</span>
          <span className="text-xs">Una fila por persona, con una columna de mail. Nombre, empresa y otras columnas son opcionales. Hasta 50.000 filas.</span>
        </button>
      ) : null}

      {done ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {done.added.toLocaleString("es-AR")} personas nuevas{done.updated ? ` · ${done.updated} completadas` : ""}
            </p>
            <p className="text-xs">
              {done.duplicates ? `${done.duplicates} repetidas en el archivo (quedó una). ` : ""}
              {done.invalid ? `${done.invalid} filas sin mail válido${done.invalidSamples.length ? ` (ej.: ${done.invalidSamples.slice(0, 3).join(" · ")})` : ""}.` : "Todos los mails eran válidos."}
            </p>
          </div>
        </div>
      ) : null}

      {preview && mapping ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> <b>{file?.name}</b> · {preview.totalRows.toLocaleString("es-AR")} filas
            <button type="button" className="ml-auto text-xs font-semibold text-primary underline" onClick={() => fileRef.current?.click()}>
              Elegir otro
            </button>
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {columnSelect("email", "Mail", true)}
            {columnSelect("name", "Nombre")}
            {columnSelect("lastName", "Apellido")}
            {columnSelect("company", "Empresa")}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/60 text-left">
                  {preview.headers.map((h, i) => (
                    <th key={i} className={cn("whitespace-nowrap px-2 py-1.5 font-semibold", i === mapping.email && "bg-primary/10 text-primary")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, r) => (
                  <tr key={r} className="border-t border-border/60">
                    {row.map((cell, c) => (
                      <td key={c} className={cn("max-w-[220px] truncate whitespace-nowrap px-2 py-1", c === mapping.email && "bg-primary/[0.04] font-medium")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.headers.some((_, i) => !used.has(i)) ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Columnas extra para usar en el texto (ej. ciudad, vendedor):</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.headers.map((h, i) =>
                  used.has(i) ? null : (
                    <label key={i} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", mapping.extras.includes(i) ? "border-primary bg-primary/5" : "border-border")}>
                      <input
                        type="checkbox"
                        checked={mapping.extras.includes(i)}
                        onChange={(e) => setMapping({ ...mapping, extras: e.target.checked ? [...mapping.extras, i] : mapping.extras.filter((c) => c !== i) })}
                      />
                      {h} <span className="text-muted-foreground">{`{{${variableKey(h)}}}`}</span>
                    </label>
                  )
                )}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {!fixedListId ? (
              <div className="space-y-1">
                <Label>Guardar en</Label>
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Lista nueva</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      Sumar a «{t.name}»
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {!target ? (
              <div className="space-y-1">
                <Label required>Nombre de la lista</Label>
                <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Asistentes Expo Integración 2026" />
              </div>
            ) : (
              <div />
            )}
            <Button disabled={busy || (!target && !name.trim())} onClick={run}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Se sacan los repetidos y los mails mal escritos. Solo importá personas que te dieron su mail (clientes, contactos de eventos, consultas): mandarle a bases compradas quema el dominio.
          </p>
        </div>
      ) : null}
    </div>
  );
}
