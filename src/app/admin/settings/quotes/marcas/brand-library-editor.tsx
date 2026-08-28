"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  deleteBrandLibraryLogo,
  saveBrandLibraryLogo,
  searchBrandLogoImages,
} from "@/server/actions/quote-brands";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type LibraryRow = {
  id: string;
  label: string;
  url: string;
  brand?: { id: string; name: string } | null;
};

export function BrandLibraryEditor({ initial }: { initial: LibraryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ title: string; url: string }[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex h-16 items-center justify-center overflow-hidden rounded border border-border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.url} alt={row.label} className="max-h-full max-w-full object-contain p-1" />
            </div>
            <p className="mt-2 truncate text-sm font-medium">{row.label}</p>
            {row.brand ? <p className="text-xs text-muted-foreground">{row.brand.name}</p> : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await deleteBrandLibraryLogo(row.id);
                  if (!result.ok) toast.error(result.error || "No se pudo quitar.");
                  else {
                    setRows((prev) => prev.filter((r) => r.id !== row.id));
                    refresh();
                  }
                })
              }
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Quitar
            </Button>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
        <h4 className="text-sm font-semibold">Agregar logo a la biblioteca</h4>
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la web (ej. Shure logo)"
            className="min-w-[200px] flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || query.trim().length < 2}
            onClick={() =>
              start(async () => {
                const found = await searchBrandLogoImages(query.trim());
                setHits(found);
              })
            }
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
        {hits.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {hits.map((hit) => (
              <button
                key={hit.url}
                type="button"
                className="rounded border border-border bg-white p-1 hover:ring-2 hover:ring-primary/40"
                onClick={() => {
                  setLabel(hit.title.split(" - ")[0]?.slice(0, 60) || query);
                  setUrl(hit.url);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hit.url} alt="" className="h-14 w-full object-contain" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="lib-label">Nombre</Label>
            <Input id="lib-label" value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="lib-url">URL</Label>
            <Input id="lib-url" value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1" />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !label.trim() || !url.trim()}
          onClick={() =>
            start(async () => {
              const result = await saveBrandLibraryLogo({ label: label.trim(), url: url.trim() });
              if (!result.ok) toast.error(result.error || "No se pudo guardar.");
              else {
                toast.success("Logo guardado en la biblioteca.");
                setLabel("");
                setUrl("");
                setHits([]);
                refresh();
              }
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Guardar en biblioteca
        </Button>
      </div>
    </div>
  );
}
