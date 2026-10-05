import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { LEAD_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";

export type AccountRequestPrefill = { fullName?: string; email?: string; phone?: string; company?: string };

/**
 * Datos para precargar el formulario desde el lead de la bienvenida. El id
 * del lead de la cookie solo vale si pertenece al mismo visitante (st_vid).
 */
export async function getAccountRequestPrefill(): Promise<AccountRequestPrefill> {
  const store = await cookies();
  const leadId = store.get(LEAD_COOKIE)?.value;
  const visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!leadId || !visitorId) return {};
  const lead = await prisma.visitorLead.findFirst({ where: { id: leadId, visitorId } }).catch((error) => {
    console.error("[expo] no se pudo leer el lead para precargar", error);
    return null;
  });
  if (!lead) return {};
  return { fullName: lead.name ?? undefined, email: lead.email, phone: lead.phone ?? undefined, company: lead.company ?? undefined };
}
