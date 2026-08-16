"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachSerperImage, generateQuoteConceptImage, searchQuoteImages, uploadQuoteContextImage } from "@/server/actions/quote-images";

type Hit = Awaited<ReturnType<typeof searchQuoteImages>>[number];

export function QuoteImagesPanel({ quoteId }: { quoteId: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [concept, setConcept] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Fotos reales: catálogo, archivo propio o Serper (vos elegís). Esquemas: DALL·E, siempre como “imagen conceptual”.
      </p>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-center hover:bg-secondary/60">
        <span className="text-sm font-medium">Subir foto de aplicación / obra</span>
        <span className="text-xs text-muted-foreground">JPG o PNG para esta COT</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set("quoteId", quoteId);
            fd.set("file", file);
            start(async () => {
              const r = await uploadQuoteContextImage(fd);
              setMsg(r.error || "Imagen subida.");
            });
            e.target.value = "";
          }}
        />
      </label>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar foto: BLAZE CI4 installation…" />
        <Button
          type="button"
          variant="outline"
          disabled={pending || q.trim().length < 3}
          onClick={() =>
            start(async () => {
              setHits(await searchQuoteImages(q));
            })
          }
        >
          Serper
        </Button>
      </div>
      {hits.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {hits.map((h) => (
            <button
              key={h.url}
              type="button"
              className="overflow-hidden rounded-md border border-border text-left"
              onClick={() =>
                start(async () => {
                  const r = await attachSerperImage({ quoteId, url: h.url });
                  setMsg(r.error || "Imagen agregada");
                })
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.thumbnail || h.url} alt={h.title} className="h-24 w-full object-cover" />
              <span className="block truncate p-1 text-[10px] text-muted-foreground">{h.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Generar esquema: zonas de audio interior + jardín…"
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || concept.trim().length < 5}
          onClick={() =>
            start(async () => {
              const r = await generateQuoteConceptImage({ quoteId, prompt: concept });
              setMsg(r.error || r.message || null);
            })
          }
        >
          Esquema IA
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
