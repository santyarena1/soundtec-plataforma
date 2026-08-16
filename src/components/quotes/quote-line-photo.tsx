"use client";

import { useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attachSerperImage,
  restoreQuoteProductCatalogImage,
  searchQuoteImages,
  uploadQuoteProductImage,
} from "@/server/actions/quote-images";

type Hit = Awaited<ReturnType<typeof searchQuoteImages>>[number];

export function QuoteLinePhoto({
  quoteId,
  productId,
  caption,
  photoUrl,
  issued,
  compact = false,
}: {
  quoteId: string;
  productId: string;
  caption: string;
  photoUrl: string | null;
  issued?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(caption);
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(file: File) {
    const fd = new FormData();
    fd.set("quoteId", quoteId);
    fd.set("productId", productId);
    fd.set("file", file);
    start(async () => {
      const r = await uploadQuoteProductImage(fd);
      setMsg(r.error || "Foto actualizada en esta cotización.");
      setOpen(false);
    });
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div
        className={
          compact
            ? "flex h-[16mm] w-[16mm] items-center justify-center overflow-hidden bg-white"
            : "flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-md border border-border bg-white"
        }
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <span className="px-1 text-center text-[9px] leading-tight text-muted-foreground print:hidden">Sin foto</span>
        )}
      </div>
      {issued ? null : (
        <div className="print:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={compact ? "h-6 px-1.5 text-[10px]" : "w-full"}
            disabled={pending}
            onClick={() => {
              setOpen((v) => !v);
              setQ(caption);
            }}
          >
            <ImagePlus className="h-3 w-3" />
            {photoUrl ? "Cambiar" : "Foto"}
          </Button>
          {open ? (
            <div className="space-y-1.5 rounded-md border border-border bg-card p-2 print:hidden">
              <label className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-[11px] font-medium hover:bg-secondary">
                Subir
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await restoreQuoteProductCatalogImage({ quoteId, productId });
                    setMsg(r.error || "Volvió la foto del catálogo.");
                  })
                }
              >
                Catálogo
              </Button>
              <div className="flex gap-1">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="h-7 text-[11px]"
                  placeholder="Buscar imagen…"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={pending || q.trim().length < 3}
                  onClick={() =>
                    start(async () => {
                      setHits(await searchQuoteImages(q));
                    })
                  }
                >
                  Buscar
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
                          const r = await attachSerperImage({
                            quoteId,
                            productId,
                            url: hit.url,
                            caption,
                          });
                          setMsg(r.error || "Foto reemplazada.");
                          setHits([]);
                          setOpen(false);
                        })
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={hit.thumbnail || hit.url} alt={hit.title} className="h-12 w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              {msg ? <p className="text-[10px] text-muted-foreground">{msg}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
