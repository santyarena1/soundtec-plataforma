import { prisma } from "@/lib/prisma";

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

  const compatiblePrimaries = product.accessoryFor.map((x) => ({
    id: x.product.id,
    name: x.product.normalizedName,
  }));

  if (compatiblePrimaries.length === 0) {
    return {
      blocked: true,
      blockedMessage: "Este accesorio no tiene productos principales compatibles configurados. Contactá a Soundtec.",
      needsAcknowledgement: false,
      compatiblePrimaries: [],
    };
  }

  if (input.primaryProductId && compatiblePrimaries.some((p) => p.id === input.primaryProductId)) {
    return { blocked: false, needsAcknowledgement: false, compatiblePrimaries };
  }

  if (input.requestId) {
    const hasPrimaryInRequest = await prisma.customerRequestItem.findFirst({
      where: {
        requestId: input.requestId,
        productId: { in: compatiblePrimaries.map((p) => p.id) },
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
  return `[Cliente confirmó compra de accesorio sin principal en la misma solicitud/carrito. Compatibles: ${names}]`;
}
