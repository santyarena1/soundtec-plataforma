"use client";

import { useState } from "react";
import { Input, Label, Textarea } from "@/components/ui/input";

export function QuoteAdvancedFields() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        Avanzado
        <span className="text-xs text-muted-foreground">{open ? "ocultar" : "metros, marcas, presupuesto…"}</span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-border px-4 py-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="areaM2">Superficie aproximada (m²)</Label>
            <Input id="areaM2" name="areaM2" />
          </div>
          <div>
            <Label htmlFor="people">Personas / cubiertos</Label>
            <Input id="people" name="people" />
          </div>
          <div>
            <Label htmlFor="budgetUsd">Techo de presupuesto (USD)</Label>
            <Input id="budgetUsd" name="budgetUsd" />
          </div>
          <div>
            <Label htmlFor="brandPref">Marcas preferidas</Label>
            <Input id="brandPref" name="brandPref" placeholder="BLAZE, Crestron…" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="brandAvoid">No ofrecer</Label>
            <Input id="brandAvoid" name="brandAvoid" placeholder="Bose…" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notas humanas (mandan sobre la IA)</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
