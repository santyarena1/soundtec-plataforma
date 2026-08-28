"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import type { BrandsDisplayMode, QuoteBrandLogoView } from "@/lib/quote-brands";
import {
  addLibraryLogoToQuote,
  addQuoteBrandSelection,
  removeQuoteBrandSelection,
  searchBrandLogoImages,
  setQuoteBrandsMode,
  syncQuoteBrandSelections,
  toggleQuoteBrandVisibility,
} from "@/server/actions/quote-brands";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

type LibraryLogo = {
  id: string;
  label: string;
  url: string;
  brand?: { id: string; name: string } | null;
};

export function QuoteBrandsEditor({
  quoteId,
  issued,
  globalMode,
  quoteMode,
  quoteBrandsModeRaw,
  selections,
  library,
}: {
  quoteId: string;
  issued: boolean;
  globalMode: BrandsDisplayMode;
  quoteMode: BrandsDisplayMode;
  quoteBrandsModeRaw: string | null;
  selections: QuoteBrandLogoView[];
  library: LibraryLogo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ title: string; imageUrl: string }[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const effectiveMode = quoteMode;

  function refresh() {
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <Label htmlFor={`brands-mode-${quoteId}`}>Presentación de marcas</Label>
          <Select
            id={`brands-mode-${quoteId}`}
            defaultValue={quoteBrandsModeRaw == null ? "inherit" : quoteBrandsModeRaw}
            disabled={issued || pending}
            className="mt-1"
            onChange={(e) => {
              const v = e.target.value;
              start(async () => {
                const result =
                  v === "inherit"
                    ? await setQuoteBrandsMode(quoteId, null)
                    : await setQuoteBrandsMode(quoteId, v === "individual" ? "individual" : "collage");
                if (!result.ok) toast.error(result.error || "No se pudo cambiar el modo.");
                else refresh();
              });
            }}
          >
            <option value="inherit">Como en configuración ({globalMode === "individual" ? "Individuales" : "Collage"})</option>
            <option value="collage">Collage institucional</option>
            <option value="individual">Logos individuales</option>
          </Select>
        </div>
        {effectiveMode === "individual" && !issued ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await syncQuoteBrandSelections(quoteId);
                if (!result.ok) toast.error(result.error || "No se pudo sincronizar.");
                else {
                  toast.success("Marcas actualizadas desde la planilla.");
                  refresh();
                }
              })
            }
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Desde productos
          </Button>
        ) : null}
      </div>

      {effectiveMode === "individual" ? (
        <>
          <p className="text-xs text-muted-foreground">
            Elegí qué logos mostrar. Podés buscar en la web, subir desde la biblioteca o sincronizar marcas de la
            planilla.
          </p>

          {selections.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {selections.map((logo) => (
                <li
                  key={logo.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
                >
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.url} alt={logo.label} className="max-h-full max-w-full object-contain p-0.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{logo.label}</p>
                    {logo.libraryLogoId ? (
                      <p className="text-[10px] text-muted-foreground">Biblioteca</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Solo esta COT</p>
                    )}
                  </div>
                  {!issued ? (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const result = await toggleQuoteBrandVisibility(logo.id, !logo.visible);
                            if (!result.ok) toast.error(result.error || "Error.");
                            else refresh();
                          })
                        }
                      >
                        {logo.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const result = await removeQuoteBrandSelection(logo.id);
                            if (!result.ok) toast.error(result.error || "Error.");
                            else refresh();
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Todavía no hay logos. Sincronizá desde productos o agregá uno.</p>
          )}

          {!issued ? (
            <div className="space-y-3 border-t border-border pt-3">
              {library.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium">Biblioteca</p>
                  <div className="flex flex-wrap gap-2">
                    {library.map((logo) => (
                      <Button
                        key={logo.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const result = await addLibraryLogoToQuote(quoteId, logo.id);
                            if (!result.ok) toast.error(result.error || "No se pudo agregar.");
                            else refresh();
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {logo.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-medium">Buscar logo en la web</p>
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ej. Bose logo png"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || query.trim().length < 2}
                    onClick={() =>
                      start(async () => {
                        const rows = await searchBrandLogoImages(query.trim());
                        setHits(rows.map((r) => ({ title: r.title, imageUrl: r.url })));
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
                        key={hit.imageUrl}
                        type="button"
                        className="overflow-hidden rounded border border-border bg-white p-1 hover:ring-2 hover:ring-primary/40"
                        onClick={() => {
                          setNewLabel(hit.title.split(" - ")[0]?.slice(0, 60) || query);
                          start(async () => {
                            const result = await addQuoteBrandSelection({
                              quoteId,
                              label: hit.title.split(" - ")[0]?.slice(0, 60) || query,
                              url: hit.imageUrl,
                              saveToLibrary,
                            });
                            if (!result.ok) toast.error(result.error || "No se pudo agregar.");
                            else {
                              toast.success("Logo agregado.");
                              setHits([]);
                              refresh();
                            }
                          });
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={hit.imageUrl} alt="" className="h-14 w-full object-contain" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveToLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                  />
                  Guardar en biblioteca para futuras cotizaciones
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1">
                    <Label htmlFor="brand-manual-label">Nombre manual</Label>
                    <Input
                      id="brand-manual-label"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Marca"
                      className="mt-1"
                    />
                  </div>
                  <div className="min-w-[200px] flex-[2]">
                    <Label htmlFor="brand-manual-url">URL de imagen</Label>
                    <Input
                      id="brand-manual-url"
                      name="brandUrl"
                      placeholder="https://…"
                      className="mt-1"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const url = (e.currentTarget as HTMLInputElement).value.trim();
                        if (!newLabel.trim() || !url) return;
                        start(async () => {
                          const result = await addQuoteBrandSelection({
                            quoteId,
                            label: newLabel.trim(),
                            url,
                            saveToLibrary,
                          });
                          if (!result.ok) toast.error(result.error || "No se pudo agregar.");
                          else {
                            toast.success("Logo agregado.");
                            (e.currentTarget as HTMLInputElement).value = "";
                            refresh();
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Modo collage: se usa la imagen institucional de marcas. Cambiá a logos individuales para elegir marca por marca.
        </p>
      )}
    </div>
  );
}
