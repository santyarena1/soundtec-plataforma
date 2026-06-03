"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  generateProductDescription,
  generateProductShortDescription,
} from "@/server/actions/product-enrichment";

interface Props {
  /** En /new no hay productId — los botones IA quedan deshabilitados hasta el primer guardado. */
  productId: string | null;
  initialShort: string;
  initialLong: string;
  isAi: boolean;
}

/**
 * Sección de descripciones DENTRO del ProductForm.
 *
 * Es la única fuente de verdad para los textos: lo que esté acá se persiste con
 * el botón principal del form (vía name="shortDescription" / "longDescription").
 * Los botones de IA generan el contenido vía server action, lo persisten en BD
 * y actualizan el estado local para que el usuario vea el resultado y pueda
 * editarlo antes de pisar con el save del form.
 */
export function DescriptionsSection({ productId, initialShort, initialLong, isAi }: Props) {
  const router = useRouter();
  const [short, setShort] = useState(initialShort);
  const [long, setLong] = useState(initialLong);
  const [genShortMark, setGenShortMark] = useState(false);
  const [genLongMark, setGenLongMark] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingShort, startShort] = useTransition();
  const [pendingLong, startLong] = useTransition();

  function generateShort() {
    if (!productId) return;
    setError(null);
    setGenShortMark(false);
    startShort(async () => {
      const r = await generateProductShortDescription(productId);
      if (!r.ok) {
        setError(r.error || "No se pudo generar la descripción corta.");
        return;
      }
      setShort(r.description || "");
      setGenShortMark(true);
      router.refresh();
    });
  }

  function generateLong() {
    if (!productId) return;
    setError(null);
    setGenLongMark(false);
    startLong(async () => {
      const r = await generateProductDescription(productId);
      if (!r.ok) {
        setError(r.error || "No se pudo generar la descripción larga.");
        return;
      }
      setLong(r.description || "");
      setGenLongMark(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label
            htmlFor="shortDescription"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Descripción corta
            {genShortMark ? (
              <Badge tone="accent" className="ml-2">
                <Sparkles className="h-3 w-3" />
                Recién generada
              </Badge>
            ) : null}
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={generateShort}
            disabled={pendingShort || pendingLong || !productId}
            title={!productId ? "Guardá el producto primero" : undefined}
          >
            {pendingShort ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generar con IA
          </Button>
        </div>
        <textarea
          id="shortDescription"
          name="shortDescription"
          rows={2}
          value={short}
          onChange={(e) => setShort(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="1–2 oraciones que describen qué es el producto y para qué sirve."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label
            htmlFor="longDescription"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Descripción larga
            {isAi && !genLongMark ? <Badge tone="accent" className="ml-2">IA</Badge> : null}
            {genLongMark ? (
              <Badge tone="accent" className="ml-2">
                <Sparkles className="h-3 w-3" />
                Recién generada
              </Badge>
            ) : null}
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={generateLong}
            disabled={pendingShort || pendingLong || !productId}
            title={!productId ? "Guardá el producto primero" : undefined}
          >
            {pendingLong ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generar con IA
          </Button>
        </div>
        <textarea
          id="longDescription"
          name="longDescription"
          rows={6}
          value={long}
          onChange={(e) => setLong(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="4–7 oraciones con usos típicos, integración y datos técnicos."
        />
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Las descripciones se guardan junto al resto del formulario con el botón principal de
        abajo. Generar con IA también las persiste automáticamente.
      </p>
    </div>
  );
}
