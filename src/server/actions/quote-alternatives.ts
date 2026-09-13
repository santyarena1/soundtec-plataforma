"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";

/**
 * Opciones cotizadas ("Solución A" / "Solución B").
 *
 * El modelo existía desde el principio y cada ítem ya apuntaba a una, pero no
 * había forma de crear una segunda ni de verla en el documento: todas las
 * cotizaciones tenían una sola opción invisible. Con más de una, el documento
 * arma una tabla y un total por opción, porque el cliente elige una.
 */

function slug(value: string, fallback: string): string {
  const clean = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

async function editableQuote(quoteId: string) {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return null;
  return loaded.quote;
}

export async function createQuoteAlternative(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const quoteId = String(formData.get("quoteId") || "");
  const quote = await editableQuote(quoteId);
  if (!quote) return;

  const count = await prisma.quoteAlternative.count({ where: { quoteId } });
  const name = String(formData.get("name") || "").trim() || `Opción ${count + 1}`;
  const key = slug(name, `opcion-${count + 1}`);

  const exists = await prisma.quoteAlternative.findUnique({
    where: { quoteId_key: { quoteId, key } },
  });

  await prisma.quoteAlternative.create({
    data: {
      quoteId,
      key: exists ? `${key}-${count + 1}` : key,
      name,
      isDefault: count === 0,
      sortOrder: count,
    },
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
}

export async function renameQuoteAlternative(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("alternativeId") || "");
  const alternative = await prisma.quoteAlternative.findUnique({ where: { id } });
  if (!alternative) return;
  const quote = await editableQuote(alternative.quoteId);
  if (!quote) return;

  const name = String(formData.get("name") || "").trim();
  const purpose = String(formData.get("purpose") || "").trim();
  await prisma.quoteAlternative.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      purpose: purpose || null,
    },
  });
  revalidatePath(`/admin/quotes/${alternative.quoteId}`);
}

/**
 * Borrar una opción no borra sus ítems: vuelven a la opción por defecto, igual
 * que al borrar un ambiente. Perder precios cargados por cerrar una opción
 * sería una sorpresa cara.
 */
export async function deleteQuoteAlternative(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("alternativeId") || "");
  const alternative = await prisma.quoteAlternative.findUnique({ where: { id } });
  if (!alternative) return;
  const quote = await editableQuote(alternative.quoteId);
  if (!quote) return;

  const remaining = await prisma.quoteAlternative.findFirst({
    where: { quoteId: alternative.quoteId, id: { not: id } },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
  });
  if (!remaining) return; // Nunca se queda sin ninguna.

  await prisma.$transaction([
    prisma.quoteItem.updateMany({
      where: { alternativeId: id },
      data: { alternativeId: remaining.id },
    }),
    prisma.quoteSection.updateMany({
      where: { alternativeId: id },
      data: { alternativeId: null },
    }),
    prisma.quoteAlternative.delete({ where: { id } }),
  ]);
  revalidatePath(`/admin/quotes/${alternative.quoteId}`);
}

/** Mueve un ítem de una opción a otra. */
export async function moveQuoteItemToAlternative(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const itemId = String(formData.get("itemId") || "");
  const alternativeId = String(formData.get("alternativeId") || "");
  const item = await prisma.quoteItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const quote = await editableQuote(item.quoteId);
  if (!quote) return;

  const target = await prisma.quoteAlternative.findFirst({
    where: { id: alternativeId, quoteId: item.quoteId },
  });
  if (!target) return;

  await prisma.quoteItem.update({ where: { id: itemId }, data: { alternativeId: target.id } });
  revalidatePath(`/admin/quotes/${item.quoteId}`);
}
