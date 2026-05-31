"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { upsertBrand } from "@/server/actions/admin-catalog";

interface Product {
  id: string;
  normalizedName: string;
  internalSku: string | null;
  isActive: boolean;
  kind: string;
}

interface Brand {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  products: Product[];
}

export function BrandDetailPanel({ brand }: { brand: Brand }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await upsertBrand(fd);
      setSaved(true);
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ver / Editar
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold">{brand.name}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* Formulario edición */}
              <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={brand.id} />
                <div>
                  <Label htmlFor={`bn-${brand.id}`} required>Nombre</Label>
                  <Input id={`bn-${brand.id}`} name="name" required defaultValue={brand.name} />
                </div>
                <div>
                  <Label htmlFor={`bl-${brand.id}`}>URL del logo</Label>
                  <Input id={`bl-${brand.id}`} name="logoUrl" type="url" defaultValue={brand.logoUrl || ""} placeholder="https://..." />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`bd-${brand.id}`}>Descripción</Label>
                  <Textarea id={`bd-${brand.id}`} name="description" rows={3} defaultValue={brand.description || ""} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={brand.isActive} />
                  Marca activa
                </label>
                <div className="sm:col-span-2 flex items-center gap-3 justify-end">
                  {saved && <span className="text-sm text-success">Guardado.</span>}
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Guardar cambios
                  </Button>
                </div>
              </form>

              {/* Logo preview */}
              {brand.logoUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Logo actual</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logoUrl} alt={brand.name} className="h-16 w-auto object-contain rounded border border-border p-1 bg-white" />
                </div>
              )}

              {/* Productos de la marca */}
              <div>
                <p className="text-sm font-semibold mb-2">
                  Productos de {brand.name} ({brand.products.length})
                </p>
                {brand.products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin productos.</p>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto rounded border border-border">
                    {brand.products.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-secondary border-b border-border last:border-0">
                        <div className="min-w-0">
                          <Link href={`/admin/products/${p.id}`} className="text-accent hover:underline truncate block">
                            {p.normalizedName}
                          </Link>
                          {p.internalSku && <span className="text-xs text-muted-foreground font-mono">{p.internalSku}</span>}
                        </div>
                        <div className="flex gap-1 ml-2 shrink-0">
                          {p.kind === "ACCESORIO" && <Badge tone="warning">Acc.</Badge>}
                          {!p.isActive && <Badge tone="muted">Inactivo</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-border px-6 py-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
