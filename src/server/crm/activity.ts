import type { ClientActivityKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
type ActivityInput = {
  clientId?: string | null;
  kind?: ClientActivityKind;
  title: string;
  body?: string | null;
  dueAt?: Date | null;
  createdById?: string | null;
  referenceType?: "REQUEST" | "QUOTE" | "MOVEMENT" | null;
  referenceId?: string | null;
};
export async function logClientActivity(input: ActivityInput) {
  if (!input.clientId) return null;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const activity = await tx.clientActivity.create({
      data: {
        clientId: input.clientId!,
        kind: input.kind ?? "SYSTEM",
        title: input.title,
        body: input.body ?? null,
        dueAt: input.dueAt ?? null,
        createdById: input.createdById ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      },
    });
    await tx.client.update({ where: { id: input.clientId! }, data: { lastActivityAt: now } });
    return activity;
  });
}
