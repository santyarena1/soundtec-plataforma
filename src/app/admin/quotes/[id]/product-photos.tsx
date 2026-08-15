"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attachSerperImage,
  fillQuoteProductImagesFromCatalog,
  restoreQuoteProductCatalogImage,
  searchQuoteImages,
  uploadQuoteProductImage,
} from "@/server/actions/quote-images";

type Hit = Awaited<ReturnType<typeof searchQuoteImages>>[number];

type Row = {
  productId: string;
  caption: string;
  currentUrl: string | null;
  catalogUrl: string | null;
};

export function QuoteProductPhotos({ quoteId, rows }: { quoteId: string; rows: Row[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Fotos de productos</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await fillQuoteProductImagesFromCatalog(quoteId);
              setMsg(r.error || "Se completaron las que faltaban con la foto del catálogo.");
            })
          }
        >
          Completar desde catálogo
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay productos en la planilla.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.productId} className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row">
              <div className="h-28 w-full overflow-hidden rounded bg-secondary/40 sm:w-36">
                {row.currentUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.currentUrl} alt={row.caption} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                    Sin foto
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">{row.caption}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !row.catalogUrl}
                    onClick={() =>
                      start(async () => {
                        const r = await restoreQuoteProductCatalogImage({ quoteId, productId: row.productId });
                        setMsg(r.error || "Volvió la foto del catálogo.");
                      })
                    }
                  >
                    Usar catálogo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setOpenId(openId === row.productId ? null : row.productId);
                      setQ(row.caption);
                      setHits([]);
                    }}
                  >
                    Buscar en Serper
                  </Button>
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-secondary">
                    Subir propia
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.set("quoteId", quoteId);
                        fd.set("productId", row.productId);
                        fd.set("file", file);
                        start(async () => {
                          const r = await uploadQuoteProductImage(fd);
                          setMsg(r.error || "Imagen subida.");
                        });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {openId === row.productId ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input value={q} onChange={(e) => setQ(e.target.value)} />
                      <Button
                        type="button"
                        size="sm"
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
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {hits.map((h) => (
                          <button
                            key={h.url}
                            type="button"
                            className="overflow-hidden rounded border border-border text-left"
                            onClick={() =>
                              start(async () => {
                                const r = await attachSerperImage({
                                  quoteId,
                                  productId: row.productId,
                                  url: h.url,
                                  caption: row.caption,
                                });
                                setMsg(r.error || "Foto reemplazada.");
                                setHits([]);
                                setOpenId(null);
                              })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={h.thumbnail || h.url} alt={h.title} className="h-20 w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
