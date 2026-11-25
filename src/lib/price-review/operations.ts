/**
 * Cambios que pueden mover precios y pasan por «Precios › Revisión de cambios».
 * Se guardan en PriceReview.operation y se ejecutan igual al simular (dentro de
 * una transacción que se deshace) y al aplicar.
 */
import type { PriceRoundingConfig } from "@/lib/price-rounding";

export type RuleKind = "margin" | "discount";

export type PriceOperation =
  /** Alta o edición de una regla (con grupo y excepciones), tal cual la manda el formulario. */
  | { type: "rule.save"; kind: RuleKind; form: Array<[string, string]> }
  /** Cambiar campos de reglas existentes (activar/desactivar, valor, nota). */
  | {
      type: "rules.update";
      kind: RuleKind;
      ids: string[];
      data: { isActive?: boolean; markupMultiplier?: number | null; marginPercent?: number; discountPercent?: number; notes?: string };
    }
  | { type: "rules.delete"; kind: RuleKind; ids: string[] }
  /** Mover productos a un rubro (ficha, edición en lote, bandeja, «Mover productos a…»). */
  | { type: "products.setCategory"; productIds: string[]; categoryId: string }
  /** Descuento propio de productos (campo de la ficha), en lote. null = sacarlo. */
  | { type: "products.setDiscount"; productIds: string[]; discountPercent: number | null }
  /** Unir un rubro con otro: pasa sus productos y lo desactiva. */
  | { type: "category.merge"; fromId: string; toId: string }
  /** Redondeo por tramos (Configuración › Precios): activar, desactivar o cambiar tramos. */
  | { type: "pricing.rounding"; config: PriceRoundingConfig };

export type PriceReviewArea = "MARGIN" | "DISCOUNT" | "CATEGORY" | "LINE" | "ROUNDING";

export function areaOf(op: PriceOperation): PriceReviewArea {
  if (op.type === "products.setCategory" || op.type === "category.merge") return "CATEGORY";
  if (op.type === "products.setDiscount") return "DISCOUNT";
  if (op.type === "pricing.rounding") return "ROUNDING";
  return op.kind === "margin" ? "MARGIN" : "DISCOUNT";
}

export const AREA_LABEL: Record<PriceReviewArea, string> = {
  MARGIN: "Márgenes",
  DISCOUNT: "Descuentos",
  CATEGORY: "Rubros",
  LINE: "Series",
  ROUNDING: "Redondeo",
};

export function isPriceOperation(value: unknown): value is PriceOperation {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "rule.save" ||
    type === "rules.update" ||
    type === "rules.delete" ||
    type === "products.setCategory" ||
    type === "products.setDiscount" ||
    type === "category.merge" ||
    type === "pricing.rounding"
  );
}
