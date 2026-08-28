"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { QuoteBlockVariant } from "@/lib/quote-block-variants";
import { saveBlockVariantsAction } from "./actions";

export function BlockVariantsEditor({
  blockKey,
  title,
  description,
  defaultBody,
  variants: initial,
}: {
  blockKey: string;
  title: string;
  description: string;
  defaultBody: string;
  variants: QuoteBlockVariant[];
}) {
  const [variants, setVariants] = useState<QuoteBlockVariant[]>(
    initial.length
      ? initial
      : [{ slug: "default", label: "Por defecto", body: defaultBody, isDefault: true }]
  );
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { slug: `v${prev.length + 1}`, label: "Nueva variante", body: defaultBody, isDefault: false },
    ]);
  }

  function save() {
    setSaved(false);
    start(async () => {
      await saveBlockVariantsAction(blockKey, variants);
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="muted-text mt-0.5">{description}</p>
        </div>

        {variants.map((variant, index) => (
          <div key={variant.slug} className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${blockKey}-${index}-label`}>Nombre visible</Label>
                <Input
                  id={`${blockKey}-${index}-label`}
                  value={variant.label}
                  onChange={(e) =>
                    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)))
                  }
                />
              </div>
              <div>
                <Label htmlFor={`${blockKey}-${index}-slug`}>Código interno</Label>
                <Input
                  id={`${blockKey}-${index}-slug`}
                  value={variant.slug}
                  onChange={(e) =>
                    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, slug: e.target.value } : v)))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`${blockKey}-${index}-body`}>Texto</Label>
              <Textarea
                id={`${blockKey}-${index}-body`}
                rows={5}
                value={variant.body}
                onChange={(e) =>
                  setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, body: e.target.value } : v)))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${blockKey}-default`}
                checked={Boolean(variant.isDefault)}
                onChange={() =>
                  setVariants((prev) => prev.map((v, i) => ({ ...v, isDefault: i === index })))
                }
              />
              Usar por defecto en cotizaciones nuevas
            </label>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            Agregar variante
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar variantes"}
          </Button>
          {saved ? <span className="text-sm text-success">Guardado.</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
