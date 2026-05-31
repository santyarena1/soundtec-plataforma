"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function applyNcmSuggestion(
  productId: string,
  position: string,
  diePercent: number | null
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  try {
    await prisma.product.update({
      where: { id: productId },
      data: {
        tariffPosition: position,
        ...(diePercent != null ? { tariffDutyPercent: diePercent } : {}),
      },
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/ncm");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar." };
  }
}
