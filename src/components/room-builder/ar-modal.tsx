"use client";

/**
 * Maqueta 3D / AR de la sala: la escena exportada se abre en model-viewer
 * (de Google). En el celular el botón "Ver en tu espacio" la pone en
 * realidad aumentada (Android: WebXR; iPhone: Quick Look); en la compu se
 * gira y se descarga el .glb.
 */

import { useEffect, useState, type DetailedHTMLProps, type HTMLAttributes } from "react";
import { Box, Download, Loader2, Smartphone, X } from "lucide-react";

const MODEL_VIEWER_SRC = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

let loader: Promise<void> | null = null;
function loadModelViewer(): Promise<void> {
  if (customElements.get("model-viewer")) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = MODEL_VIEWER_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error("No se pudo cargar el visor 3D"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

export function ArModal({ name, buildModel, onClose }: { name: string; buildModel: () => Promise<Blob>; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    Promise.all([buildModel(), loadModelViewer()])
      .then(([blob]) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "No se pudo armar la maqueta"));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [buildModel]);

  const fileName = `${name.replace(/[^\w\- áéíóúñ]+/gi, "").trim() || "sala"}.glb`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Maqueta 3D y AR">
      <div className="flex h-[min(90vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-[#1e3553]" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Maqueta 3D · {name}</p>
              <p className="text-[11px] text-slate-500">Girala con el mouse. En el celular, tocá “Ver en tu espacio” para ponerla en realidad aumentada.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 bg-gradient-to-b from-slate-100 to-slate-200">
          {url ? (
            <model-viewer
              src={url}
              alt={`Maqueta de ${name}`}
              ar=""
              ar-modes="webxr quick-look scene-viewer"
              ar-scale="auto"
              camera-controls=""
              auto-rotate=""
              shadow-intensity="1"
              exposure="1"
              environment-image="neutral"
              style={{ width: "100%", height: "100%" }}
            >
              <button
                slot="ar-button"
                type="button"
                className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#1e3553] px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
              >
                <Smartphone className="h-4 w-4" /> Ver en tu espacio
              </button>
            </model-viewer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Armando la maqueta…
                </span>
              )}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-[11px] text-slate-500">La realidad aumentada funciona en celulares Android con Chrome y en iPhone con Safari.</p>
          {url ? (
            <a href={url} download={fileName} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> Descargar .glb
            </a>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
