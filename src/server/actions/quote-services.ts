"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { loadQuoteForEdit, requireQuotePermission } from "@/lib/quote-access";
import { targetAlternativeId } from "@/lib/quote-alternatives";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { searchQuoteServices, serviceItemDescription } from "@/server/quote-services";

type Result = { ok: boolean; error?: string; message?: string };

const serviceInput = z.object({
  name: z.string().trim().min(2, "Poné un nombre.").max(200),
  description: z.string().trim().max(4000).nullable(),
  /** null = se carga a mano en cada cotización. */
  priceUsd: z.number().finite().nullable(),
  ivaPercent: z.number().min(0).max(100),
  categoryId: z.string().min(1).nullable(),
  isActive: z.boolean(),
});
export type QuoteServiceInput = z.input<typeof serviceInput>;

function done(message: string): Result {
  revalidatePath("/admin/products/servicios");
  return { ok: true, message };
}

const toData = (d: z.infer<typeof serviceInput>) => ({
  name: d.name,
  description: d.description || null,
  priceUsd: d.priceUsd == null ? null : new Prisma.Decimal(d.priceUsd),
  ivaPercent: new Prisma.Decimal(d.ivaPercent),
  categoryId: d.categoryId,
  isActive: d.isActive,
});

/** Solo admins: alta de un servicio. */
export async function createQuoteService(input: QuoteServiceInput): Promise<Result> {
  await requireAdmin();
  const parsed = serviceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.quoteService.create({ data: toData(parsed.data) });
  return done("Servicio agregado.");
}

/** Solo admins: cambiar nombre, detalle, precio, IVA, rubro o si se usa. */
export async function updateQuoteService(id: string, input: QuoteServiceInput): Promise<Result> {
  await requireAdmin();
  const parsed = serviceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.quoteService.update({ where: { id }, data: toData(parsed.data) });
  return done("Guardado.");
}

/** Buscador de cotizaciones (editor): servicios activos. */
export async function searchServicesForQuote(query: string) {
  await requireQuotePermission("quotes.edit");
  const rows = await searchQuoteServices(query);
  return rows.map((s) => ({ id: s.id, name: s.name, description: s.description, priceUsd: s.priceUsd == null ? null : Number(s.priceUsd) }));
}

/** Agrega un servicio a la cotización: nombre + detalle completo, con su precio de venta (o 0 para cargar a mano). */
export async function addQuoteServiceToQuote(input: { quoteId: string; serviceId: string; groupId?: string | null; alternativeId?: string | null }): Promise<Result> {
  await requireQuotePermission("quotes.edit");
  const loaded = await loadQuoteForEdit(input.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const service = await prisma.quoteService.findUnique({ where: { id: input.serviceId } });
  if (!service?.isActive) return { ok: false, error: "Ese servicio ya no está disponible." };
  const unit = (await getSetting(QUOTE_SETTING_KEYS.defaultUnit, "u")).trim() || service.unit;
  const price = service.priceUsd == null ? 0 : Number(service.priceUsd);
  const sort = loaded.quote.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  const group = input.groupId ? loaded.quote.itemGroups.find((g) => g.id === input.groupId) ?? null : null;
  await prisma.quoteItem.create({
    data: {
      quoteId: loaded.quote.id,
      groupId: group?.id ?? null,
      alternativeId: targetAlternativeId({ alternatives: loaded.quote.alternatives, requested: input.alternativeId, group }),
      kind: "SERVICE",
      serviceType: "servicio",
      quantity: new Prisma.Decimal(1),
      description: serviceItemDescription(service),
      unitPriceUsd: new Prisma.Decimal(price),
      lineTotalUsd: new Prisma.Decimal(price),
      priceOverridden: true,
      unit,
      deliveryKey: service.deliveryText || null,
      ivaRate: service.ivaPercent,
      source: "MANUAL",
      sortOrder: sort,
      notes: service.priceUsd == null ? "Cargá el precio" : null,
    },
  });
  revalidatePath(`/admin/quotes/${loaded.quote.id}`);
  return { ok: true, message: service.priceUsd == null ? `${service.name}: agregado sin precio, cargalo en la fila.` : `${service.name} agregado.` };
}
