"use client";

import { useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { deactivateSoundTubeProduct, setSoundTubeManualPrice } from "@/server/actions/soundtube-review";
import { useDecision } from "./_use-decision";

type Item = { id: string; sku: string; title: string; brand: string; hasImage: boolean };

const num = (v: string) => Number(v.replace(",", "."));

function Row({ item, run, pending }: { item: Item; run: ReturnType<typeof useDecision>["run"]; pending: boolean }) {
  const [cost, setCost] = useState("");
  const [mup, setMup] = useState("2.75");
  return (
    <div className="grid items-center gap-2 border-b border-border py-2 text-sm md:grid-cols-[minmax(0,1fr)_7rem_5rem_auto]">
      <div className="min-w-0">
        <p className="font-mono text-xs font-semibold">{item.sku}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground" title={item.title}>
          {item.brand} · {item.title}
          {item.hasImage ? null : <ImageOff className="h-3 w-3 shrink-0" />}
        </p>
      </div>
      <Input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="SPRDIS US" inputMode="decimal" className="h-8" aria-label={`Costo de ${item.sku}`} />
      <Input value={mup} onChange={(e) => setMup(e.target.value)} placeholder="MUP" inputMode="decimal" className="h-8" aria-label={`MUP de ${item.sku}`} />
      <div className="flex gap-1">
        <Button size="sm" disabled={pending || !cost.trim()} onClick={() => run(() => setSoundTubeManualPrice(item.id, num(cost), num(mup)))}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deactivateSoundTubeProduct(item.id))}>
          Desactivar
        </Button>
      </div>
    </div>
  );
}

/**
 * Productos que vienen del portal de SoundTube y no están en la lista: quedan
 * sin precio («a consultar») hasta que se les carga acá el costo (SPRDIS US) y
 * el MUP. Ese precio se conserva al subir otras listas.
 */
export function UnpricedSection({ items }: { items: Item[] }) {
  const { pending, error, run } = useDecision();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.sku} ${i.title} ${i.brand}`.toLowerCase().includes(s)) : items;
  }, [items, q]);
  return (
    <Card id="sin-precio">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Productos sin precio</h2>
          <span className={`text-xs font-medium ${items.length ? "text-amber-700" : "text-emerald-600"}`}>
            {items.length ? `${items.length} para cargar precio` : "Todos tienen precio"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Están en el portal de SoundTube pero no en la lista Excel: se ven como «Consultá precio». El único precio válido es
          SPRDIS US; cargalo acá con su MUP, o desactivá el producto si no se vende. Lo que cargues se conserva al subir otras listas
          (si después aparece en una lista, manda la lista).
        </p>
        {items.length > 8 ? <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU, nombre o marca" className="max-w-sm" /> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="max-h-[32rem] overflow-y-auto">
          {shown.map((item) => (
            <Row key={item.id} item={item} run={run} pending={pending} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
