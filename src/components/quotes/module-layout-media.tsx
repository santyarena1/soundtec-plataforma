"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, BookmarkPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QUOTE_MODULE_LAYOUTS, type QuoteModuleLayout } from "@/lib/quote-module-layout";
import {
  saveSectionToLibrary,
  updateQuoteSectionLayout,
} from "@/server/actions/quote-modules";
import {
  attachSerperImage,
  deleteQuoteAsset,
  generateQuoteConceptImage,
  searchQuoteImages,
  uploadQuoteContextImage,
} from "@/server/actions/quote-images";

type Hit = Awaited<ReturnType<typeof searchQuoteImages>>[number];

export function ModuleLayoutMedia({
  quoteId,
  sectionId,
  layout,
  images,
  issued,
  showLibrarySave,
}: {
  quoteId: string;
  sectionId: string;
  layout: QuoteModuleLayout;
  images: { id: string; url: string; caption?: string | null }[];
  issued?: boolean;
  showLibrarySave?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [concept, setConcept] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();

  if (issued) return null;

  function refresh(ok: boolean, error?: string, success?: string) {
    if (!ok) {
      toast.error(error || "No se pudo actualizar.");
      return;
    }
    if (success) toast.success(success);
    router.refresh();
  }

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap gap-1">
        {QUOTE_MODULE_LAYOUTS.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.hint}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await updateQuoteSectionLayout({ sectionId, layout: item.key });
                refresh(result.ok, result.error);
              })
            }
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              layout === item.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((image) => (
            <div key={image.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="h-12 w-12 rounded border border-border object-cover" />
              <form
                action={deleteQuoteAsset}
                onSubmit={() => {
                  start(() => undefined);
                }}
              >
                <input type="hidden" name="assetId" value={image.id} />
                <Button type="submit" size="sm" variant="ghost" className="absolute -right-2 -top-2 h-5 w-5 p-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setOpen((v) => !v)}>
          <ImagePlus className="mr-1 h-3 w-3" />
          {open ? "Cerrar fotos" : "Agregar foto"}
        </Button>
        {showLibrarySave ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await saveSectionToLibrary({ sectionId });
                refresh(result.ok, result.error, "Borrador guardado para otras COT.");
              })
            }
          >
            <BookmarkPlus className="mr-1 h-3 w-3" />
            Guardar borrador
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2 rounded-md border border-dashed border-border p-2">
          <label className="block cursor-pointer rounded border border-border px-2 py-1.5 text-[11px] hover:bg-muted/50">
            Subir archivo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set("quoteId", quoteId);
                fd.set("sectionId", sectionId);
                fd.set("file", file);
                start(async () => {
                  const result = await uploadQuoteContextImage(fd);
                  refresh(result.ok, result.error, "Foto subida.");
                });
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex gap-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en Serper…"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={pending || query.trim().length < 3}
              onClick={() =>
                start(async () => {
                  setHits(await searchQuoteImages(query));
                })
              }
            >
              Serper
            </Button>
          </div>
          {hits.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {hits.map((hit) => (
                <button
                  key={hit.url}
                  type="button"
                  className="overflow-hidden rounded border border-border"
                  onClick={() =>
                    start(async () => {
                      const result = await attachSerperImage({
                        quoteId,
                        url: hit.url,
                        sectionId,
                      });
                      refresh(result.ok, result.error, "Foto agregada.");
                    })
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={hit.thumbnail || hit.url} alt="" className="h-14 w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-1">
            <Input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Generar con IA: esquema de sala…"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={pending || concept.trim().length < 8}
              onClick={() =>
                start(async () => {
                  const result = await generateQuoteConceptImage({
                    quoteId,
                    prompt: concept,
                    sectionId,
                  });
                  refresh(result.ok, result.error, result.message || "Imagen generada.");
                })
              }
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "IA"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
