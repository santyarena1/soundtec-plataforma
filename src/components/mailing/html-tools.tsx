"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileArchive, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TemplateWarning } from "@/lib/mailing/html-template";

/** Avisos de entregabilidad de un HTML (no impiden guardar ni mandar). */
export function TemplateWarnings({ warnings }: { warnings: TemplateWarning[] }) {
  if (!warnings.length)
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Sin avisos: peso, imágenes, enlaces y ancho en orden.
      </p>
    );
  return (
    <ul className="space-y-1.5">
      {warnings.map((w, i) => (
        <li key={i} className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", w.code === "no_unsubscribe" ? "bg-secondary/60 text-muted-foreground" : "bg-amber-50 text-amber-900")}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w.message}
        </li>
      ))}
    </ul>
  );
}

/** Miniatura: el HTML dibujado de verdad (iframe sin scripts) achicado. */
export function HtmlThumbnail({ html, className }: { html: string; className?: string }) {
  return (
    <div className={cn("relative h-48 overflow-hidden rounded-lg border border-border bg-[#eef0f3]", className)}>
      <iframe
        title="Miniatura"
        srcDoc={html}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: 680, height: 1200, transform: "scale(0.4)" }}
      />
    </div>
  );
}

export const HTML_HELP =
  "Subí un .html, un .zip con el .html y la carpeta de imágenes, o pegá el código. Las imágenes del .zip, las de rutas relativas y las incrustadas en base64 se suben solas y quedan con dirección absoluta. Se sacan scripts, formularios, iframes y código en enlaces. Variables: {{nombre}}, {{empresa}}, {{nombre|colega}}, columnas del Excel y {{baja}} para ubicar el enlace de baja (si no está, se agrega el pie legal al final).";

/**
 * Entrada de un HTML: archivo (.html o .zip) o código pegado. `submit` recibe
 * el FormData armado (file o code) y lo manda a la acción que corresponda.
 */
export function HtmlImporter({ submit, label = "Importar", extra }: { submit: (data: FormData) => Promise<boolean>; label?: string; extra?: React.ReactNode }) {
  const [mode, setMode] = useState<"file" | "code">("file");
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  function go() {
    const data = new FormData();
    if (mode === "file") {
      if (!file) return void toast.error("Elegí el archivo.");
      data.set("file", file);
    } else {
      if (!code.trim()) return void toast.error("Pegá el código HTML.");
      data.set("code", code);
    }
    start(async () => {
      const ok = await submit(data);
      if (ok) {
        setFile(null);
        setCode("");
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-3">
      <div role="tablist" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {(
          [
            { key: "file", label: "Archivo .html o .zip", icon: FileArchive },
            { key: "code", label: "Pegar código", icon: ClipboardPaste },
          ] as const
        ).map(({ key, label: text, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium", mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="h-4 w-4" /> {text}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <div>
          <input ref={fileRef} type="file" accept=".html,.htm,.zip,text/html,application/zip" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Archivo HTML o ZIP" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            <Upload className="h-5 w-5 text-primary" />
            {file ? <span className="font-semibold text-foreground">{file.name}</span> : <span className="font-semibold text-foreground">Elegí el .html o el .zip</span>}
            <span className="text-xs">.zip: el .html y sus imágenes (PNG, JPG, GIF, WebP), hasta 20 MB.</span>
          </button>
        </div>
      ) : (
        <Textarea rows={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="<!doctype html>…" className="font-mono text-xs" aria-label="Código HTML" />
      )}
      {extra}
      <Button disabled={busy || (mode === "file" ? !file : !code.trim())} onClick={go}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {label}
      </Button>
    </div>
  );
}
