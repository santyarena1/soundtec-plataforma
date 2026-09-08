"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { AiFeedbackType, AiFeedbackVerdict } from "@prisma/client";

const schema = z.object({
  entity: z.string().min(1),
  refId: z.string().min(1),
  type: z.nativeEnum(AiFeedbackType),
  verdict: z.nativeEnum(AiFeedbackVerdict),
  comment: z.string().max(2000).optional().nullable(),
  generatedText: z.string().max(20000).optional().nullable(),
  issues: z.array(z.string()).default([]),
});

export async function submitAiFeedback(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    entity: formData.get("entity"),
    refId: formData.get("refId"),
    type: formData.get("type"),
    verdict: formData.get("verdict"),
    comment: formData.get("comment"),
    generatedText: formData.get("generatedText"),
    issues: formData.getAll("issues"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  if (parsed.data.issues.includes("other") && !parsed.data.comment?.trim()) {
    return { ok: false, error: "Contanos que corregirias cuando elegis Otro." };
  }
  const previous = await prisma.aiContentFeedback.findFirst({
    where: { userId: user.id, type: parsed.data.type, refId: parsed.data.refId },
    orderBy: { createdAt: "desc" },
  });
  const data = {
    userId: user.id,
    type: parsed.data.type,
    refEntity: parsed.data.entity,
    refId: parsed.data.refId,
    verdict: parsed.data.verdict,
    comment: parsed.data.comment || null,
    generatedText: parsed.data.generatedText || null,
    issues: parsed.data.issues,
    resolvedAt: null,
    resolvedById: null,
  };
  if (previous) await prisma.aiContentFeedback.update({ where: { id: previous.id }, data });
  else await prisma.aiContentFeedback.create({ data });

  if (parsed.data.type === "PRODUCT_DESCRIPTION") {
    await prisma.product
      .update({
        where: { id: parsed.data.refId },
        data: {
          aiDescriptionFeedbackStatus: parsed.data.verdict === "CORRECT" ? "APPROVED" : "REJECTED",
        },
      })
      .catch(() => null);
  }

  return { ok: true };
}

export async function resolveAiFeedback(id: string) {
  const { user } = await requirePermission("ai.manage");
  const feedback = await prisma.aiContentFeedback.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedById: user.id },
    select: { refId: true, type: true },
  });
  if (feedback.type === "PRODUCT_DESCRIPTION") {
    const open = await prisma.aiContentFeedback.count({
      where: {
        refId: feedback.refId,
        type: "PRODUCT_DESCRIPTION",
        verdict: "HAS_ERRORS",
        resolvedAt: null,
      },
    });
    if (!open)
      await prisma.product.update({
        where: { id: feedback.refId },
        data: { aiDescriptionFeedbackStatus: null },
      });
    revalidatePath("/admin/products/" + feedback.refId);
  }
  revalidatePath("/admin/feedback");
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function listProductAiFeedback(productId: string) {
  await requirePermission("ai.manage");
  return prisma.aiContentFeedback.findMany({
    where: {
      refId: productId,
      type: "PRODUCT_DESCRIPTION",
      verdict: "HAS_ERRORS",
      resolvedAt: null,
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
}
