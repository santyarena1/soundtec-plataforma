"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { applySoundTubeReview, closeSoundTubeReview, setReviewTaxonomy } from "@/server/actions/soundtube-review";
import type { ClassificationQuestion, MissingItem, NewProductQuestion, PairQuestion } from "@/server/soundtube/review";
import type { ParsedPriceList } from "@/services/soundtube/price-list";
import { ClassificationSection, NewProductsSection, PairsSection } from "./_decisions";
import { MissingSection } from "./_missing";
import { StartReviewForm } from "./_start-form";

interface Props {
  fileName: string;
  uploadedAt: string;
  rowsCount: number;
  warnings: ParsedPriceList["warnings"];
  invalid: ParsedPriceList["invalid"];
  matchedCount: number;
  pending: number;
  pairs: PairQuestion[];
  newProducts: NewProductQuestion[];
  classification: ClassificationQuestion[];
  missing: MissingItem[];
  brands: string[];
  applyTaxonomy: boolean;
  appliedAt: string | null;
  applyResult: { updated: number; created: number; deactivated: number } | null;
}

function Section({ id, title, count, help, children }: { id: string; title: string; count: number; help: string; children: ReactNode }) {
  return (
    <Card id={id}>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <span className={`text-xs font-medium ${count > 0 ? "text-amber-700" : "text-emerald-600"}`}>
            {count > 0 ? `${count} por decidir` : "Todo decidido"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{help}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export function ReviewPanel(props: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const pairsPending = props.pairs.filter((q) => !q.decision).length;
  const newPending = props.newProducts.filter((q) => !q.decision || (q.decision.create && !q.decision.brand)).length;
  const classPending = props.classification.filter((q) => q.decision === undefined).length;
  const deactivations = props.missing.filter((m) => m.action === "deactivate").length;
  const creations = props.newProducts.filter((q) => q.decision?.create).length;

  if (props.appliedAt) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="flex items-center gap-2 text-base font-semibold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Lista aplicada el {new Date(props.appliedAt).toLocaleString("es-AR")}
          </p>
          {props.applyResult ? (
            <p className="text-sm">
              {props.applyResult.updated} productos actualizados, {props.applyResult.created} creados y {props.applyResult.deactivated} desactivados.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">Si quedó todo bien, cerrá la revisión y el módulo desaparece del menú.</p>
          <Button
            disabled={busy}
            onClick={() =>
              start(async () => {
                await closeSoundTubeReview();
                router.push("/admin/products");
              })
            }
          >
            Cerrar revisión
          </Button>
        </CardContent>
      </Card>
    );
  }

  const nav = [
    { href: "#pares", label: "¿Mismo producto?", n: pairsPending },
    { href: "#nuevos", label: "Productos nuevos", n: newPending },
    { href: "#clasificacion", label: "Clasificación", n: classPending },
    { href: "#afuera", label: "Quedan afuera", n: 0 },
  ];

  return (
    <div className="space-y-5">
      <Card className="sticky top-2 z-10 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{props.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {props.rowsCount} SKUs · {props.matchedCount} coinciden con el sistema · subida el {new Date(props.uploadedAt).toLocaleString("es-AR")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className={`rounded-full border px-3 py-1 text-xs ${n.n > 0 ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/20" : "border-border text-muted-foreground"}`}>
                {n.label}{n.n > 0 ? ` · ${n.n}` : ""}
              </a>
            ))}
          </div>
          <p className={`ml-auto text-sm font-semibold ${props.pending > 0 ? "text-amber-700" : "text-emerald-600"}`}>
            {props.pending > 0 ? `Faltan ${props.pending} decisiones` : "Listo para aplicar"}
          </p>
        </CardContent>
      </Card>

      {props.warnings.length + props.invalid.length > 0 ? (
        <Card>
          <CardContent className="space-y-1 p-5 text-xs">
            <h2 className="mb-2 text-base font-semibold">Avisos de la lista</h2>
            {props.warnings.map((w) => (
              <p key={w.sku}><span className="font-mono font-semibold">{w.sku}</span>: {w.message}</p>
            ))}
            {props.invalid.map((i) => (
              <p key={`${i.excelRow}-${i.sku}`} className="text-destructive">
                Fila {i.excelRow} <span className="font-mono">{i.sku}</span>: {i.reason} (no se carga)
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Section id="pares" title="1. ¿Es el mismo producto?" count={pairsPending} help="El SKU de la lista no existe en el sistema, pero hay productos parecidos (con -BK, -GB, -WH, KIT…). Si es el mismo, se actualiza ese producto y la equivalencia queda guardada para las próximas listas. En rojo: costo actual muy distinto o en 0 (probablemente otro producto).">
        <PairsSection items={props.pairs} />
      </Section>

      <Section id="nuevos" title="2. Productos nuevos" count={newPending} help="No existen en el sistema. «Crear» lo da de alta con el SKU, la descripción, el costo, el MUP y la clasificación de la lista.">
        <NewProductsSection items={props.newProducts} brands={props.brands} />
      </Section>

      <Section id="clasificacion" title="3. Clasificación repetida" count={classPending} help="El SKU aparece varias veces en la lista con clasificación distinta. Elegí cuál vale.">
        <ClassificationSection items={props.classification} />
      </Section>

      <Section id="afuera" title="4. Quedan afuera de la lista" count={0} help="Productos de SoundTube y sus marcas que están en el sistema pero no en la lista. No es obligatorio decidir: si no tocás nada, quedan como están.">
        <MissingSection items={props.missing} />
      </Section>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={props.applyTaxonomy}
                disabled={busy}
                onChange={(e) => start(async () => { await setReviewTaxonomy(e.target.checked); router.refresh(); })}
              />
              <span>Aplicar la clasificación de la lista (CATEGORIA → Rubro, SEGMENTO → Subrubro, FAMILIA, TIPO).</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Al aplicar: {props.matchedCount} productos actualizan costo y MUP, se crean {creations}, se desactivan {deactivations}.
            </p>
            {message ? <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}>{message.text}</p> : null}
          </div>
          <Button
            disabled={busy || props.pending > 0}
            onClick={() => {
              if (!window.confirm("Se aplica la lista con todas las decisiones. ¿Seguir?")) return;
              setMessage(null);
              start(async () => {
                const r = await applySoundTubeReview();
                setMessage(r.ok ? { ok: true, text: `Listo: ${r.summary ?? ""}` } : { ok: false, text: r.error });
                router.refresh();
              });
            }}
          >
            {busy ? "Aplicando…" : props.pending > 0 ? `Faltan ${props.pending} decisiones` : "Aplicar lista"}
          </Button>
        </CardContent>
      </Card>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Reemplazar la lista subida</summary>
        <div className="mt-2"><StartReviewForm replace /></div>
      </details>
    </div>
  );
}
