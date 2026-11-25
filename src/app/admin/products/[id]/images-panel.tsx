"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Loader2, Upload, Search, AlertCircle, CheckCircle2, Youtube } from "lucide-react";
import { attachProductImage, searchProductImagesAction, uploadProductImageFile } from "@/server/actions/product-enrichment";
import { addProductVideoAction } from "@/server/actions/product-media";
import { GalleryEditor, type GalleryEditorItem } from "./gallery-editor";

interface SerperResult {
  url: string;
  title: string;
  thumbnail?: string;
  pageUrl?: string;
}

/** Fotos que se aceptan al subir: el servidor reconoce el formato por el contenido. */
const IMAGE_ACCEPT = "image/*,.heic,.heif,.avif,.svg,.tif,.tiff,.bmp";
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|svg|tiff?|bmp)$/i;

interface Props {
  productId: string;
  productName: string;
  /** Fotos y videos en el orden de la galería. */
  media: GalleryEditorItem[];
}

export function ProductImagesPanel({ productId, productName, media }: Props) {
  const images = media.filter((item) => item.kind === "image");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [markAsPrimary, setMarkAsPrimary] = useState(!images.some((img) => img.kind === "image" && img.isPrimary));

  // Serper search
  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<SerperResult[]>([]);
  const [serperError, setSerperError] = useState<string | null>(null);
  const [pendingSearch, startSearch] = useTransition();
  const [showSerper, setShowSerper] = useState(false);
  // Adjuntar desde Serper o desde una URL pegada: estado por dirección.
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachErrors, setAttachErrors] = useState<Record<string, string>>({});
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);

  async function addVideo() {
    const url = videoUrl.trim();
    if (!url) return;
    setAddingVideo(true);
    setVideoError(null);
    try {
      const r = await addProductVideoAction({ productId, url });
      if (!r.ok) {
        setVideoError(r.error);
        return;
      }
      setVideoUrl("");
      router.refresh();
    } catch {
      setVideoError("No se pudo agregar el video. Probá de nuevo.");
    } finally {
      setAddingVideo(false);
    }
  }

  async function attachFromUrl(key: string, input: { url: string; alt?: string; pageUrl?: string; thumbnail?: string; origin: "serper" | "url" }) {
    setAttaching(key);
    setAttachNote(null);
    setAttachErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const r = await attachProductImage({ productId, ...input, isPrimary: images.length === 0 });
      if (r.ok) {
        setAttachNote(r.note || "Imagen agregada.");
        if (input.origin === "url") setPastedUrl("");
        router.refresh();
      } else {
        setAttachErrors((prev) => ({ ...prev, [key]: r.error || "No se pudo agregar la imagen." }));
      }
    } catch {
      setAttachErrors((prev) => ({ ...prev, [key]: "No se pudo agregar la imagen. Probá de nuevo." }));
    } finally {
      setAttaching(null);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);
    let uploaded = 0;
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("productId", productId);
        fd.append("file", file);
        fd.append("alt", productName);
        // Solo la primera del lote queda como primary si el usuario lo pidió
        fd.append("isPrimary", uploaded === 0 && markAsPrimary ? "true" : "false");
        const r = await uploadProductImageFile(fd);
        if (r.ok) {
          uploaded++;
        } else {
          errors.push(`${file.name}: ${r.error}`);
        }
      }
      if (uploaded > 0) {
        setUploadSuccess(
          `${uploaded} imagen(es) subida(s).${errors.length > 0 ? ` ${errors.length} falló/fallaron.` : ""}`
        );
        router.refresh();
      }
      if (errors.length > 0) {
        setUploadError(errors.join(" · "));
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    // HEIC y algunos TIFF llegan sin tipo desde Windows: se reconocen por la extensión.
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name));
    if (files.length === 0) {
      setUploadError("Soltá archivos de imagen.");
      return;
    }
    void uploadFiles(files);
  }

  function handleSearchSerper() {
    setSerperError(null);
    startSearch(async () => {
      const r = await searchProductImagesAction(productId, query);
      if (!r.ok) setSerperError(r.error || "No se pudo buscar imágenes.");
      setResults(r.images);
    });
  }

  return (
    <Card data-tour="product-images">
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-accent" />
            <h2 className="heading-3">Fotos y videos del producto</h2>
            <Badge tone="muted">{media.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Archivo, URL pegada o búsqueda: el sistema descarga la foto, la convierte si
            hace falta y la guarda en nuestro almacenamiento.
          </p>
        </div>

        {/* ── GALERÍA (fotos y videos, ordenables) ── */}
        <GalleryEditor productId={productId} items={media} />

        {/* ── VIDEO ── */}
        <form
          className="space-y-1.5 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void addVideo();
          }}
        >
          <Label htmlFor="productVideoUrl" className="flex items-center gap-1.5">
            <Youtube className="h-3.5 w-3.5 text-accent" /> Sumar un video de YouTube o Instagram
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="productVideoUrl"
              type="url"
              inputMode="url"
              className="min-w-[16rem] flex-1"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=… · youtu.be/… · instagram.com/reel/…"
            />
            <Button type="submit" size="sm" disabled={!videoUrl.trim() || addingVideo}>
              {addingVideo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Agregar video
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Se guarda el link, no el archivo. En la ficha aparece con un ícono de play y el reproductor carga recién cuando el cliente lo toca.
          </p>
          {videoError ? (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0" /> {videoError}
            </p>
          ) : null}
        </form>

        {/* ── DROPZONE ── */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative rounded-xl border-2 border-dashed transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-border bg-secondary/30"
          } px-6 py-8 text-center`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) void uploadFiles(e.target.files);
            }}
          />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            ) : (
              <Upload className="h-6 w-6 text-accent" />
            )}
          </div>
          <p className="mt-3 text-sm font-medium">
            {uploading ? "Subiendo…" : "Arrastrá una imagen acá o hacé click"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP, AVIF, GIF, TIFF, BMP, SVG o HEIC · hasta 15 MB · se convierten solas si hace falta · podés soltar varias a la vez
          </p>
          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            <Button
              type="button"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Elegir archivo
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={markAsPrimary}
                onChange={(e) => setMarkAsPrimary(e.target.checked)}
                className="h-3 w-3"
              />
              Marcar la primera como principal
            </label>
          </div>
          {uploadError ? (
            <p className="mt-3 text-xs text-destructive flex items-center justify-center gap-1">
              <AlertCircle className="h-3 w-3" /> {uploadError}
            </p>
          ) : null}
          {uploadSuccess ? (
            <p className="mt-3 text-xs text-success flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {uploadSuccess}
            </p>
          ) : null}
        </div>

        {/* ── PEGAR URL ── */}
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const url = pastedUrl.trim();
            if (url) void attachFromUrl("pasted", { url, alt: productName, origin: "url" });
          }}
        >
          <Label htmlFor="pastedImageUrl">O pegá la dirección de una imagen</Label>
          <div className="flex items-center gap-2">
            <Input
              id="pastedImageUrl"
              type="url"
              inputMode="url"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="https://sitio-del-fabricante.com/foto.png"
            />
            <Button type="submit" size="sm" disabled={!pastedUrl.trim() || attaching !== null}>
              {attaching === "pasted" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Agregar
            </Button>
          </div>
          {attachErrors.pasted ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" /> {attachErrors.pasted}
            </p>
          ) : null}
        </form>
        {attachNote ? (
          <p className="text-xs text-success flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 shrink-0" /> {attachNote}
          </p>
        ) : null}

        {/* ── BÚSQUEDA SERPER (colapsable, opcional) ── */}
        <div className="rounded-md border border-border">
          <button
            type="button"
            onClick={() => setShowSerper((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/30"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Search className="h-3 w-3" /> Buscar imágenes en Google (Serper)
            </span>
            <span className="text-muted-foreground">{showSerper ? "−" : "+"}</span>
          </button>
          {showSerper && (
            <div className="p-3 space-y-3 border-t border-border">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="serperQuery">Query</Label>
                  <Input
                    id="serperQuery"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ej. Shure SLXD24/SM58"
                  />
                </div>
                <Button type="button" size="sm" onClick={handleSearchSerper} disabled={pendingSearch}>
                  {pendingSearch ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Buscar
                </Button>
              </div>
              {serperError ? <p className="text-xs text-destructive">{serperError}</p> : null}
              {results.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {results.map((r, index) => {
                    const key = `serper-${index}`;
                    return (
                    <div
                      key={`${r.url}-${index}`}
                      className="flex flex-col overflow-hidden rounded-md border border-border bg-card"
                    >
                      <div className="aspect-square bg-secondary">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.thumbnail || r.url}
                          alt={r.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-2">
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.title}</p>
                        <button
                          type="button"
                          disabled={attaching !== null}
                          onClick={() =>
                            void attachFromUrl(key, { url: r.url, alt: r.title, pageUrl: r.pageUrl, thumbnail: r.thumbnail, origin: "serper" })
                          }
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent underline disabled:opacity-50"
                        >
                          {attaching === key ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {attaching === key ? "Descargando…" : "Adjuntar"}
                        </button>
                        {attachErrors[key] ? (
                          <p className="mt-1 text-[11px] leading-snug text-destructive">{attachErrors[key]}</p>
                        ) : null}
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
