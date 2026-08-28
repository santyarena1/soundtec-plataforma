"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { QuoteBlockVariant } from "@/lib/quote-block-variants";
import { applySectionVariant } from "@/server/actions/quotes";
import { Label, Select } from "@/components/ui/input";

export function SectionVariantPicker({
  sectionId,
  blockKey,
  currentSlug,
  variants,
  issued,
}: {
  sectionId: string;
  blockKey: string;
  currentSlug: string | null;
  variants: QuoteBlockVariant[];
  issued: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (variants.length === 0) return null;

  const value = currentSlug || variants.find((v) => v.isDefault)?.slug || variants[0]?.slug || "";

  return (
    <div className="mt-2 max-w-md">
      <Label htmlFor={`variant-${sectionId}`}>Variante de texto</Label>
      <Select
        id={`variant-${sectionId}`}
        defaultValue={value}
        disabled={issued || pending}
        className="mt-1"
        onChange={(e) => {
          const slug = e.target.value;
          start(async () => {
            const result = await applySectionVariant({ sectionId, blockKey, variantSlug: slug });
            if (!result.ok) toast.error(result.error || "No se pudo aplicar la variante.");
            else {
              toast.success("Variante aplicada.");
              router.refresh();
            }
          });
        }}
      >
        {variants.map((variant) => (
          <option key={variant.slug} value={variant.slug}>
            {variant.label}
            {variant.isDefault ? " (predeterminada)" : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
