"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Loader2, Upload, Search, Star, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  attachProductImage,
  deleteProductImage,
  searchProductImagesAction,
  setPrimaryImage,
  uploadProductImageFile,
} from "@/server/actions/product-enrichment";
import { ConfirmSubmit } from "@/components/ui/confirm-button";

interface Image {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  source: string | null;
}

interface SerperResult {
  url: string;
  title: string;
  thumbnail?: string;
}

interface Props {
  productId: string;
  productName: string;
  images: Image[];
}

export function ProductImagesPanel({ productId, productName, images }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [markAsPrimary, setMarkAsPrimary] = useState(!images.some((img) => img.isPrimary));

  // Serper search
  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<SerperResult[]>([]);
  const [serperError, setSerperError] = useState<string | null>(null);
  const [pendingSearch, startSearch] = useTransition();
  const [showSerper, setShowSerper] = useState(false);

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
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
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
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-accent" />
            <h2 className="heading-3">Imágenes del producto</h2>
            <Badge tone="muted">{images.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Las imágenes se suben como archivo. El sistema las guarda en Vercel Blob
            y persiste la URL — así la BD queda liviana.
          </p>
        </div>

        {/* ── GALERÍA ── */}
        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((img) => (
              <div
                key={img.id}
                className={`relative overflow-hidden rounded-md border ${
                  img.isPrimary ? "border-accent ring-2 ring-accent/40" : "border-border"
                }`}
              >
                <div className="aspect-square bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt || ""} className="h-full w-full object-cover" />
                </div>
                {img.isPrimary && (
                  <div className="absolute top-1.5 left-1.5">
                    <Badge tone="accent" className="text-[10px]">
                      <Star className="h-2.5 w-2.5" /> Principal
                    </Badge>
                  </div>
                )}
                <div className="flex items-center justify-between gap-1 p-2 bg-card">
                  <span className="text-[10px] text-muted-foreground truncate" title={img.source || "manual"}>
                    {img.source || "manual"}
                  </span>
                  <div className="flex gap-1.5">
                    {!img.isPrimary ? (
                      <form action={setPrimaryImage}>
                        <input type="hidden" name="id" value={img.id} />
                        <input type="hidden" name="productId" value={productId} />
                        <button
                          type="submit"
                          className="text-[10px] text-accent hover:underline inline-flex items-center gap-0.5"
                          title="Marcar como principal"
                        >
                          <Star className="h-2.5 w-2.5" />
                          Principal
                        </button>
                      </form>
                    ) : null}
                    <form action={deleteProductImage}>
                      <input type="hidden" name="id" value={img.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <ConfirmSubmit
                        confirmMessage="¿Quitar esta imagen?"
                        className="text-[10px] text-destructive inline-flex items-center gap-0.5"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        Quitar
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Este producto todavía no tiene imágenes.</p>
        )}

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
            accept="image/*"
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
            PNG, JPEG, WebP, GIF o AVIF · hasta 8 MB · podés soltar varios archivos a la vez
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
                  {results.map((r) => (
                    <form
                      key={r.url}
                      action={attachProductImage}
                      className="flex flex-col overflow-hidden rounded-md border border-border bg-card"
                    >
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="url" value={r.url} />
                      <input type="hidden" name="alt" value={r.title} />
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
                          type="submit"
                          className="mt-1 text-xs font-medium text-accent underline"
                        >
                          Adjuntar
                        </button>
                      </div>
                    </form>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
