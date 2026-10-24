"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { savePricingSettings } from "@/server/actions/pricing-settings";

export function PricingSettingsForm({ defaultMarkup, tcSource, tcFallback, currentRate }: { defaultMarkup: string; tcSource: string; tcFallback: string; currentRate: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-5"
      onChange={() => {
        setDirty(true);
        setMessage(null);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await savePricingSettings(data);
          if (!result.ok) return setMessage({ ok: false, text: result.error });
          setDirty(false);
          setMessage({ ok: true, text: "Guardado. Los precios ya usan estos valores." });
          router.refresh();
        });
      }}
    >
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Markup por defecto</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se usa para un producto que no tiene ninguna regla de margen (de producto, marca, categoría…) ni COEF VTA en su ficha. Las reglas se manejan en
          Precios → Márgenes.
        </p>
        <div className="mt-3 w-40">
          <Label htmlFor="defaultMarkup">Markup (×)</Label>
          <Input id="defaultMarkup" name="defaultMarkup" inputMode="decimal" defaultValue={defaultMarkup} placeholder="1,35" />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Dólar para los precios en pesos</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se consulta solo, cada 10 minutos. Hoy: <b className="text-foreground">${currentRate.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</b>
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tcSource">Qué dólar usar</Label>
            <Select id="tcSource" name="tcSource" defaultValue={tcSource}>
              <option value="blue">Dólar blue</option>
              <option value="oficial">Dólar oficial</option>
              <option value="mep">Dólar MEP</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="tcFallback">Dólar de respaldo (opcional)</Label>
            <Input id="tcFallback" name="tcFallback" inputMode="decimal" defaultValue={tcFallback} placeholder="Ej. 1550" />
            <p className="mt-1 text-xs text-muted-foreground">Solo si falla la consulta en internet. Si lo dejás vacío, se usa el último valor que funcionó.</p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {message ? <span className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</span> : dirty ? <span className="text-sm text-warning">Cambios sin guardar</span> : null}
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </form>
  );
}
