"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { uploadFormMedia } from "@/server/actions/forms";

/** Imagen (o video) de un formulario: se sube o se pega una URL. */
export function MediaField({
  formId,
  label,
  value,
  onChange,
  accept = "image",
  hint,
}: {
  formId: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  accept?: "image" | "video";
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlMode, setUrlMode] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("formId", formId);
    fd.set("file", file);
    const result = await uploadFormMedia(fd);
    setUploading(false);
    if (!result.ok) return void toast.error(result.error);
    onChange(result.url);
    toast.success(accept === "video" ? "Video subido." : "Imagen subida.");
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {value ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-2">
          {accept === "video" ? (
            <video src={value} className="h-24 w-40 rounded-md bg-black object-contain" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-24 w-40 rounded-md bg-white object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground" title={value}>{value}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" /> Cambiar
              </button>
              <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </button>
            </div>
          </div>
        </div>
      ) : urlMode ? (
        <input
          autoFocus
          placeholder="https://…"
          className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const url = (e.target as HTMLInputElement).value.trim();
              if (/^https?:\/\//i.test(url)) onChange(url);
              setUrlMode(false);
            }
          }}
          onBlur={(e) => {
            const url = e.target.value.trim();
            if (/^https?:\/\//i.test(url)) onChange(url);
            setUrlMode(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => input.current?.click()}
            className="inline-flex h-20 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? "Subiendo…" : accept === "video" ? "Subir video (MP4)" : "Subir imagen"}
          </button>
          <button type="button" onClick={() => setUrlMode(true)} className="inline-flex h-20 items-center gap-2 rounded-lg border border-border px-4 text-sm text-muted-foreground hover:bg-secondary">
            <Link2 className="h-4 w-4" /> Pegar URL
          </button>
        </div>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept === "video" ? "video/mp4,video/webm,video/quicktime" : "image/png,image/jpeg,image/webp,image/gif,image/svg+xml"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
