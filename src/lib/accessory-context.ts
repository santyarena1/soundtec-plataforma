import { prisma } from "@/lib/prisma";
import { productsMatchingRulesWhere } from "@/lib/compatibility-rules";

export interface CompatiblePrimary {
  id: string;
  name: string;
}

export interface AccessoryPolicyResult {
  /** Bloqueo duro (ej. sin productos principales configurados). */
  blocked: boolean;
  blockedMessage?: string;
  /** Aviso: accesorio pensado para ir con un principal, pero se puede continuar. */
  needsAcknowledgement: boolean;
  warningMessage?: string;
  compatiblePrimaries: CompatiblePrimary[];
}

export async function evaluateAccessoryPolicy(input: {
  productId: string;
  requestId?: string | null;
  primaryProductId?: string | null;
}): Promise<AccessoryPolicyResult> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: {
      accessoryFor: {
        include: {
          product: { select: { id: true, normalizedName: true } },
        },
      },
    },
  });

  if (!product) {
    return { blocked: true, blockedMessage: "Producto no encontrado.", needsAcknowledgement: false, compatiblePrimaries: [] };
  }

  if (product.kind !== "ACCESORIO" || !product.accessoryRequiredWithPrimary) {
    return { blocked: false, needsAcknowledgement: false, compatiblePrimaries: [] };
  }

  // Compatibles de a pares + los que entran por las reglas «compatible con» (rubro, marca, línea).
  const ruleWhere = await productsMatchingRulesWhere(product.id);
  const byRules = ruleWhere
    ? await prisma.product.findMany({ where: { AND: [ruleWhere, { kind: "PRINCIPAL" }] }, select: { id: true, normalizedName: true }, take: 200, orderBy: { normalizedName: "asc" } })
    : [];
  const compatiblePrimaries = [
    ...product.accessoryFor.map((x) => ({ id: x.product.id, name: x.product.normalizedName })),
    ...byRules.filter((p) => !product.accessoryFor.some((x) => x.product.id === p.id)).map((p) => ({ id: p.id, name: p.normalizedName })),
  ];

  if (compatiblePrimaries.length === 0) {
    return {
      blocked: true,
      blockedMessage: "Este accesorio no tiene productos principales compatibles configurados. Contactá a Soundtec.",
      needsAcknowledgement: false,
      compatiblePrimaries: [],
    };
  }

  const primaryMatchesRules =
    input.primaryProductId && ruleWhere ? (await prisma.product.count({ where: { AND: [ruleWhere, { id: input.primaryProductId }] } })) > 0 : false;
  if (input.primaryProductId && (primaryMatchesRules || compatiblePrimaries.some((p) => p.id === input.primaryProductId))) {
    return { blocked: false, needsAcknowledgement: false, compatiblePrimaries };
  }

  if (input.requestId) {
    const hasPrimaryInRequest = await prisma.customerRequestItem.findFirst({
      where: {
        requestId: input.requestId,
        OR: [
          { productId: { in: compatiblePrimaries.map((p) => p.id) } },
          ...(ruleWhere ? [{ product: ruleWhere }] : []),
        ],
      },
      select: { id: true },
    });
    if (hasPrimaryInRequest) {
      return { blocked: false, needsAcknowledgement: false, compatiblePrimaries };
    }
  }

  const names = compatiblePrimaries
    .slice(0, 4)
    .map((p) => p.name)
    .join(", ");

  return {
    blocked: false,
    needsAcknowledgement: true,
    warningMessage: `Este producto es un accesorio compatible con: ${names}${compatiblePrimaries.length > 4 ? "…" : ""}. Recomendamos solicitarlo junto con el producto principal.`,
    compatiblePrimaries,
  };
}

export function accessoryAckNote(compatiblePrimaries: CompatiblePrimary[]): string {
  const names = compatiblePrimaries.map((p) => p.name).join(", ");
  return `[Cliente confirmó compra de accesorio sin principal en la misma pedido/carrito. Compatibles: ${names}]`;
}
