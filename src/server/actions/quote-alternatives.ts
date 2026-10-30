"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForEdit, requireQuotePermission } from "@/lib/quote-access";
import { alternativeOf, defaultAlternativeId, rowsOfAlternative } from "@/lib/quote-alternatives";

/**
 * Alternativas («Opción A» / «Opción B»): propuestas distintas para el mismo
 * cliente. Cada una tiene su propia planilla (ambientes, productos y total) y
 * el documento las muestra una debajo de la otra, porque el cliente elige una.
 */

type Result = { ok: boolean; error?: string; alternativeId?: string };

function slug(value: string, fallback: string): string {
  const clean = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function revalidate(quoteId: string) {
  revalidatePath(`/admin/quotes/${quoteId}`);
}

/** Nombre libre de repetir: «Opción B», «Opción C»… */
function nextName(existing: string[]): string {
  for (let i = 0; i < 26; i += 1) {
    const name = `Opción ${String.fromCharCode(65 + i)}`;
    if (!existing.includes(name)) return name;
  }
  return `Opción ${existing.length + 1}`;
}

/**
 * Crea una alternativa vacía o, con `copyFromId`, una copia de otra con sus
 * ambientes y productos (para cambiar solo lo que difiere).
 */
export async function createQuoteAlternative(input: { quoteId: string; copyFromId?: string | null; name?: string }): Promise<Result> {
  await requireQuotePermission("quotes.edit");
  const loaded = await loadQuoteForEdit(input.quoteId);
  const quote = loaded.quote;
  if (!quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };

  const alternatives = quote.alternatives;
  const source = input.copyFromId ? alternatives.find((a) => a.id === input.copyFromId) ?? null : null;
  if (input.copyFromId && !source) return { ok: false, error: "Esa alternativa ya no existe." };

  // La primera vez que se separa en alternativas, la existente pasa a llamarse «Opción A».
  const renameFirst = alternatives.length === 1 && alternatives[0].name === "Solución";
  const names = alternatives.map((a) => (renameFirst ? "Opción A" : a.name));
  const name = input.name?.trim() || nextName(names);
  const keys = new Set(alternatives.map((a) => a.key));
  let key = slug(name, `opcion-${alternatives.length + 1}`);
  while (keys.has(key)) key = `${key}-${alternatives.length + 1}`;
  const sortOrder = alternatives.reduce((max, a) => Math.max(max, a.sortOrder), -1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    if (renameFirst) await tx.quoteAlternative.update({ where: { id: alternatives[0].id }, data: { name: "Opción A" } });
    const alternative = await tx.quoteAlternative.create({
      data: { quoteId: quote.id, key, name, isDefault: alternatives.length === 0, sortOrder },
    });
    if (source) await copyAlternativeContent(tx, quote, source.id, alternative.id);
    return alternative;
  });
  revalidate(quote.id);
  return { ok: true, alternativeId: created.id };
}

type LoadedQuote = NonNullable<Awaited<ReturnType<typeof loadQuoteForEdit>>["quote"]>;

async function copyAlternativeContent(tx: Prisma.TransactionClient, quote: LoadedQuote, fromId: string, toId: string) {
  const groupMap = new Map<string, string>();
  for (const group of rowsOfAlternative(quote.itemGroups, fromId, quote.alternatives)) {
    const copy = await tx.quoteItemGroup.create({
      data: { quoteId: quote.id, alternativeId: toId, title: group.title, body: group.body, sortOrder: group.sortOrder },
    });
    groupMap.set(group.id, copy.id);
  }
  const items = rowsOfAlternative(quote.items, fromId, quote.alternatives);
  const itemMap = new Map<string, string>();
  // Primero los productos y después sus líneas «incluido sin cargo», que apuntan a ellos.
  const ordered = [...items.filter((i) => !i.includedWithId), ...items.filter((i) => i.includedWithId)];
  for (const item of ordered) {
    const copy = await tx.quoteItem.create({
      data: {
        quoteId: quote.id,
        alternativeId: toId,
        groupId: item.groupId ? groupMap.get(item.groupId) ?? null : null,
        includedWithId: item.includedWithId ? itemMap.get(item.includedWithId) ?? null : null,
        includedPerUnit: item.includedPerUnit,
        kind: item.kind,
        productId: item.productId,
        serviceType: item.serviceType,
        quantity: item.quantity,
        unit: item.unit,
        description: item.description,
        unitPriceUsd: item.unitPriceUsd,
        lineTotalUsd: item.lineTotalUsd,
        priceOverridden: item.priceOverridden,
        ivaRate: item.ivaRate,
        deliveryKey: item.deliveryKey,
        optional: item.optional,
        excluded: item.excluded,
        sortOrder: item.sortOrder,
        source: item.source,
        locked: item.locked,
        quantityRationale: item.quantityRationale,
        notes: item.notes,
        notesVisible: item.notesVisible,
      },
    });
    itemMap.set(item.id, copy.id);
  }
}

export async function updateQuoteAlternative(input: { alternativeId: string; name?: string; purpose?: string }): Promise<Result> {
  await requireQuotePermission("quotes.edit");
  const alternative = await prisma.quoteAlternative.findUnique({ where: { id: input.alternativeId } });
  if (!alternative) return { ok: false, error: "Esa alternativa ya no existe." };
  const loaded = await loadQuoteForEdit(alternative.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };

  const data: { name?: string; purpose?: string | null } = {};
  if (input.name != null) {
    const name = input.name.trim().slice(0, 80);
    if (!name) return { ok: false, error: "La alternativa necesita un nombre." };
    data.name = name;
  }
  if (input.purpose != null) data.purpose = input.purpose.trim().slice(0, 500) || null;
  await prisma.quoteAlternative.update({ where: { id: alternative.id }, data });
  revalidate(alternative.quoteId);
  return { ok: true };
}

/**
 * Borrar una alternativa borra su planilla (ambientes y productos): cada
 * alternativa es una propuesta aparte. La pantalla pide confirmación antes.
 * Siempre queda al menos una.
 */
export async function deleteQuoteAlternative(input: { alternativeId: string }): Promise<Result> {
  await requireQuotePermission("quotes.edit");
  const alternative = await prisma.quoteAlternative.findUnique({ where: { id: input.alternativeId } });
  if (!alternative) return { ok: false, error: "Esa alternativa ya no existe." };
  const loaded = await loadQuoteForEdit(alternative.quoteId);
  const quote = loaded.quote;
  if (!quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  if (quote.alternatives.length <= 1) return { ok: false, error: "La cotización necesita al menos una alternativa." };

  const remaining = quote.alternatives.filter((a) => a.id !== alternative.id);
  const itemIds = rowsOfAlternative(quote.items, alternative.id, quote.alternatives).map((i) => i.id);
  const groupIds = rowsOfAlternative(quote.itemGroups, alternative.id, quote.alternatives).map((g) => g.id);
  const promoteId = alternative.isDefault || defaultAlternativeId(quote.alternatives) === alternative.id ? remaining[0].id : null;

  await prisma.$transaction([
    prisma.quoteItem.deleteMany({ where: { id: { in: itemIds }, includedWithId: { not: null } } }),
    prisma.quoteItem.deleteMany({ where: { id: { in: itemIds } } }),
    prisma.quoteItemGroup.deleteMany({ where: { id: { in: groupIds } } }),
    prisma.quoteSection.updateMany({ where: { alternativeId: alternative.id }, data: { alternativeId: null } }),
    prisma.quoteAlternative.delete({ where: { id: alternative.id } }),
    ...(promoteId ? [prisma.quoteAlternative.update({ where: { id: promoteId }, data: { isDefault: true } })] : []),
  ]);
  revalidate(alternative.quoteId);
  return { ok: true, alternativeId: promoteId ?? remaining.find((a) => a.isDefault)?.id ?? remaining[0].id };
}

/** Mueve una alternativa un lugar a la izquierda o a la derecha. */
export async function moveQuoteAlternative(input: { alternativeId: string; direction: "left" | "right" }): Promise<Result> {
  await requireQuotePermission("quotes.edit");
  const alternative = await prisma.quoteAlternative.findUnique({ where: { id: input.alternativeId } });
  if (!alternative) return { ok: false, error: "Esa alternativa ya no existe." };
  const loaded = await loadQuoteForEdit(alternative.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const ordered = [...loaded.quote.alternatives].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((a) => a.id === alternative.id);
  const swap = ordered[input.direction === "left" ? index - 1 : index + 1];
  if (!swap) return { ok: true };
  const reordered = ordered.map((a) => (a.id === alternative.id ? swap : a.id === swap.id ? alternative : a));
  await prisma.$transaction(reordered.map((a, i) => prisma.quoteAlternative.update({ where: { id: a.id }, data: { sortOrder: i } })));
  revalidate(alternative.quoteId);
  return { ok: true };
}

/** Pasa un producto (con sus líneas incluidas) a otra alternativa. */
export async function moveQuoteItemToAlternative(input: { itemId: string; alternativeId: string }): Promise<Result> {
  await requireQuotePermission("quotes.edit");
  const item = await prisma.quoteItem.findUnique({ where: { id: input.itemId } });
  if (!item) return { ok: false, error: "El ítem ya no existe." };
  const loaded = await loadQuoteForEdit(item.quoteId);
  const quote = loaded.quote;
  if (!quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const target = quote.alternatives.find((a) => a.id === input.alternativeId);
  if (!target) return { ok: false, error: "Esa alternativa no es de esta cotización." };
  if (alternativeOf(item, quote.alternatives) === target.id) return { ok: true };

  // Los ambientes son de cada alternativa: en la otra entra sin ambiente.
  await prisma.quoteItem.updateMany({
    where: { OR: [{ id: item.id }, { includedWithId: item.id }] },
    data: { alternativeId: target.id, groupId: null },
  });
  revalidate(item.quoteId);
  return { ok: true };
}
