"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { QuoteBlockVariant } from "@/lib/quote-block-variants";
import { applySectionVariant } from "@/server/actions/quotes";
import { Label, Select } from "@/components/ui/input";

/**
 * Qué versión de este texto sale en la cotización. «Automática» sigue al tipo de
 * presupuesto y a quién va; elegir una a mano la deja fija.
 */
export function SectionVariantPicker({
  sectionId,
  blockKey,
  currentSlug,
  isAuto,
  variants,
  issued,
}: {
  sectionId: string;
  blockKey: string;
  currentSlug: string | null;
  /** La sección sigue la elección automática (no se eligió ni escribió a mano). */
  isAuto: boolean;
  variants: QuoteBlockVariant[];
  issued: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (variants.length === 0) return null;

  const currentLabel = variants.find((v) => v.slug === currentSlug)?.label ?? "Texto general";
  const value = isAuto ? "auto" : currentSlug || "general";

  return (
    <div className="mt-2 max-w-md">
      <Label htmlFor={`variant-${sectionId}`}>Versión de este texto</Label>
      <Select
        id={`variant-${sectionId}`}
        defaultValue={value}
        disabled={issued || pending}
        className="mt-1"
        onChange={(e) => {
          const slug = e.target.value;
          start(async () => {
            const result = await applySectionVariant({ sectionId, blockKey, variantSlug: slug });
            if (!result.ok) toast.error(result.error || "No se pudo cambiar la versión.");
            else {
              toast.success(slug === "auto" ? "Vuelve a elegirse sola según el tipo y a quién va." : "Versión aplicada.");
              router.refresh();
            }
          });
        }}
      >
        <option value="auto">{isAuto ? `Automática (hoy: ${currentLabel})` : "Automática según tipo y a quién va"}</option>
        <option value="general">Texto general</option>
        {variants.map((variant) => (
          <option key={variant.slug} value={variant.slug}>
            {variant.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
