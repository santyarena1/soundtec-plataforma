/**
 * Leads de Expo. Todos los campos son opcionales: si el visitante no deja
 * nada, no se crea basura en la base.
 *
 * No se crea un Client comercial automáticamente: eso se decide después,
 * a mano, desde el CRM.
 */

// Cliente normal: los modelos del asistente no son datos de cliente, así que
// no dependen del guard de tenant.
import { prisma } from "@/lib/prisma";

export interface LeadInput {
  sessionId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  projectInfo?: string | null;
}

function clean(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function hasAnyLeadData(input: LeadInput): boolean {
  return Boolean(
    clean(input.name, 1) ||
      clean(input.email, 1) ||
      clean(input.phone, 1) ||
      clean(input.company, 1) ||
      clean(input.projectInfo, 1)
  );
}

export type LeadResult =
  | { ok: true; created: boolean; leadId: string }
  | { ok: false; reason: "EMPTY" | "NO_SESSION" };

export async function saveExpoLead(input: LeadInput): Promise<LeadResult> {
  if (!hasAnyLeadData(input)) return { ok: false, reason: "EMPTY" };

  const session = await prisma.aiChatSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, initialProductId: true, activeProductIds: true },
  });
  if (!session) return { ok: false, reason: "NO_SESSION" };

  const data = {
    name: clean(input.name, 160),
    email: clean(input.email, 200),
    phone: clean(input.phone, 60),
    company: clean(input.company, 160),
    projectInfo: clean(input.projectInfo, 2000),
  };

  const interest = Array.from(
    new Set([...(session.initialProductId ? [session.initialProductId] : []), ...session.activeProductIds])
  ).slice(0, 12);

  const existing = await prisma.expoLead.findUnique({ where: { sessionId: session.id } });

  const lead = existing
    ? await prisma.expoLead.update({
        where: { sessionId: session.id },
        data: {
          // Un campo vacío en el segundo envío no borra lo que ya había.
          name: data.name ?? existing.name,
          email: data.email ?? existing.email,
          phone: data.phone ?? existing.phone,
          company: data.company ?? existing.company,
          projectInfo: data.projectInfo ?? existing.projectInfo,
          productsOfInterest: interest.length > 0 ? interest : existing.productsOfInterest,
        },
      })
    : await prisma.expoLead.create({
        data: {
          sessionId: session.id,
          ...data,
          initialProductId: session.initialProductId,
          productsOfInterest: interest,
        },
      });

  await prisma.aiChatSession.update({
    where: { id: session.id },
    data: { leadCaptured: true },
  });

  return { ok: true, created: !existing, leadId: lead.id };
}

/**
 * Resumen del interés detectado. Determinístico: sale de los productos y las
 * preguntas de la sesión, sin gastar una llamada extra al modelo.
 */
export async function buildLeadSummary(sessionId: string): Promise<string | null> {
  const session = await prisma.aiChatSession.findUnique({
    where: { id: sessionId },
    select: {
      activeProductIds: true,
      initialProductId: true,
      questionCount: true,
      messages: {
        where: { role: "user" },
        orderBy: { createdAt: "asc" },
        take: 8,
        select: { content: true },
      },
    },
  });
  if (!session) return null;

  const ids = Array.from(
    new Set([...(session.initialProductId ? [session.initialProductId] : []), ...session.activeProductIds])
  ).slice(0, 8);

  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { normalizedName: true, brand: { select: { name: true } } },
      })
    : [];

  const lines: string[] = [];
  if (products.length > 0) {
    lines.push(
      `Productos consultados: ${products
        .map((product) => `${product.brand?.name ? `${product.brand.name} ` : ""}${product.normalizedName}`)
        .join("; ")}`
    );
  }
  if (session.messages.length > 0) {
    lines.push(`Preguntas (${session.questionCount}): ${session.messages.map((m) => m.content).join(" | ")}`);
  }
  if (lines.length === 0) return null;
  return lines.join("\n").slice(0, 2000);
}
