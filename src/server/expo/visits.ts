import type { ExpoVisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventStatus } from "@/lib/expo/event-status";

/** Registra una visita. Best-effort: nunca rompe la navegación. */
export async function recordVisit(input: {
  visitorId: string | undefined;
  qrId?: string | null;
  type: ExpoVisitType;
  brandId?: string | null;
}): Promise<void> {
  if (!input.visitorId) return;
  try {
    await prisma.expoVisit.create({
      data: { visitorId: input.visitorId, qrId: input.qrId ?? null, type: input.type, brandId: input.brandId ?? null },
    });
  } catch (error) {
    console.error("[expo] no se pudo registrar la visita", error);
  }
}

/** QR (con evento) a partir del código de la cookie; null si no existe o está inactivo. */
export async function findQrWithEvent(code: string | undefined) {
  if (!code) return null;
  return prisma.expoQr.findFirst({ where: { code, isActive: true }, include: { event: true } });
}

/**
 * QR de la cookie solo si su evento está VIGENTE. Es la ventana de
 * atribución: leads, pedidos de cuenta y vistas de marca se cargan al
 * QR/evento únicamente mientras dura la expo.
 */
export async function findLiveQr(code: string | undefined) {
  const qr = await findQrWithEvent(code);
  return qr && eventStatus(qr.event) === "LIVE" ? qr : null;
}
