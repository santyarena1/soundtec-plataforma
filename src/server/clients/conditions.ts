/**
 * Descuentos del cliente cargados desde su ficha (alta o edición): un
 * descuento general y/o descuentos por marca o categoría. Se guardan como
 * reglas de descuento del cliente con un groupId propio, así la ficha las
 * puede reemplazar sin tocar las reglas avanzadas que se arman en
 * Precios → Descuentos.
 */

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { autoPriority } from "@/lib/pricing-scope";

export const clientDiscountSchema = z.object({
  /** ALL = sobre todo el catálogo. */
  target: z.enum(["ALL", "BRAND", "CATEGORY"]),
  targetId: z.string().max(64).nullable().optional(),
  percent: z.number({ invalid_type_error: "Poné el porcentaje." }).gt(0, "El descuento tiene que ser mayor a 0.").max(90, "Máximo 90 %."),
});
export type ClientDiscountInput = z.infer<typeof clientDiscountSchema>;

export const conditionsGroupId = (clientId: string) => `client-conditions:${clientId}`;

const SCOPE = { ALL: "CLIENT", BRAND: "BRAND", CATEGORY: "CATEGORY" } as const;

/** Reemplaza los descuentos de la ficha del cliente (dentro de una transacción). */
export async function replaceClientDiscounts(
  tx: Prisma.TransactionClient,
  clientId: string,
  clientName: string,
  discounts: ClientDiscountInput[],
  names: { brands: Map<string, string>; categories: Map<string, string> }
): Promise<void> {
  const groupId = conditionsGroupId(clientId);
  await tx.discountRule.deleteMany({ where: { groupId } });
  const seen = new Set<string>();
  const rows = discounts.flatMap((d) => {
    const key = `${d.target}:${d.targetId ?? ""}`;
    if (seen.has(key)) return [];
    if (d.target !== "ALL" && !d.targetId) return [];
    seen.add(key);
    const scopeType = SCOPE[d.target];
    const what =
      d.target === "ALL"
        ? "todo el catálogo"
        : d.target === "BRAND"
          ? `marca ${names.brands.get(d.targetId!) ?? "?"}`
          : `categoría ${names.categories.get(d.targetId!) ?? "?"}`;
    return [
      {
        name: `${clientName} · ${d.percent}% en ${what}`,
        priority: autoPriority(scopeType, true),
        scopeType,
        scopeId: d.target === "ALL" ? null : d.targetId!,
        clientId,
        discountPercent: d.percent,
        groupId,
        notes: "Condición comercial cargada en la ficha del cliente.",
      },
    ];
  });
  if (rows.length) await tx.discountRule.createMany({ data: rows });
}
