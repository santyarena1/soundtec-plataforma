"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { AiFeedbackType, AiFeedbackVerdict } from "@prisma/client";

const schema = z.object({
  entity: z.string().min(1),
  refId: z.string().min(1),
  type: z.nativeEnum(AiFeedbackType),
  verdict: z.nativeEnum(AiFeedbackVerdict),
  comment: z.string().max(2000).optional().nullable(),
});

export async function submitAiFeedback(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    entity: formData.get("entity"),
    refId: formData.get("refId"),
    type: formData.get("type"),
    verdict: formData.get("verdict"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await prisma.aiContentFeedback.create({
    data: {
      userId: user.id,
      type: parsed.data.type,
      refEntity: parsed.data.entity,
      refId: parsed.data.refId,
      verdict: parsed.data.verdict,
      comment: parsed.data.comment || null,
    },
  });

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


