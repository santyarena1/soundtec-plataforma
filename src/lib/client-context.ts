import { prisma } from "@/lib/prisma";

/**
 * ID comercial del cliente (empresa) para precios, visibilidad y pedidos.
 * - Usuarios de portal con `clientId` → usan ese Client.
 * - Legacy: usuarios CLIENT sin `clientId` pero con reglas bajo su userId → siguen usando userId.
 */
export async function resolveCommercialClientId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clientId: true, role: true },
  });
  if (!user) return null;
  if (user.clientId) return user.clientId;
  // Legacy: algunos CLIENT viejos usaban userId como Client.id. Solo si el Client existe.
  if (user.role === "CLIENT") {
    const legacy = await prisma.client.findUnique({ where: { id: userId }, select: { id: true } });
    return legacy?.id ?? null;
  }
  return null;
}

export async function requireCommercialClientId(userId: string): Promise<string> {
  const id = await resolveCommercialClientId(userId);
  if (!id) throw new Error("El usuario no está vinculado a un cliente comercial.");
  return id;
}
