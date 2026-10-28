"use server";

import { searchQuoteServices } from "@/server/quote-services";
import { cleanQuoteReference } from "@/lib/quote-status";
import { quoteUnitPrices } from "@/lib/quote-unit-price";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForEdit, requireQuotePermission } from "@/lib/quote-access";
import { createQuoteShell } from "@/server/actions/quotes";
import { issueQuote } from "@/server/actions/quote-export";
import { changeQuoteDocumentType } from "@/server/actions/quote-document-types";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { buildProductSearchWhere, sortBySearchRelevance } from "@/lib/product-search";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { isQuoteAudience } from "@/lib/quote-audiences-db";
import { toDocumentType } from "@/lib/quote-document-types";

const itemSchema = z.object({
  uid: z.string().min(1),
  /** null = ítem libre (escrito a mano, sin producto del catálogo). */
  productId: z.string().nullable(),
  /** Texto del ítem libre. */
  name: z.string().max(500).default(""),
  /** Detalle debajo del nombre (servicios): sale completo en el PDF. */
  detail: z.string().max(4000).default(""),
  quantity: z.number().positive("La cantidad tiene que ser mayor que cero."),
  unitPriceUsd: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  note: z.string().max(1000).default(""),
  included: z.boolean().default(false),
  /** Línea incluida sin cargo de otra línea (uid del producto). */
  parentUid: z.string().nullable().optional(),
  perParent: z.number().int().positive().nullable().optional(),
});

/** El tipo base define cuánto contenido lleva el PDF (Corto, Estándar, Completo). */
const LAYOUT_BY_BASE = {
  resumido: "COMPACT",
  tecnico: "STANDARD",
  premium: "EDITORIAL",
} as const;

const schema = z.object({
  /** Si viene, se edita esa cotización rápida en vez de crear otra. */
  quoteId: z.string().nullable().default(null),
  clientId: z.string().nullable(),
  /** Cliente escrito a mano, sin alta. */
  clientName: z.string().max(200).default(""),
  contactName: z.string().max(160).default(""),
  reference: z.string().max(200).default(""),
  /** Tipo de documento (base o propio, ej. «Compacto escolar»). */
  profileKey: z.string().min(1).default("resumido"),
  /** A quién va: rubro, "" = ninguno, "auto" = el del cliente o del tipo. */
  audience: z.string().default("auto"),
  taxMode: z.enum(["NOTE", "NONE", "ADDED"]).default("NOTE"),
  validityDays: z.number().int().min(1).max(365),
  showProductPhotos: z.boolean().default(true),
  issue: z.boolean(),
  items: z.array(itemSchema).min(1, "Agregá al menos un ítem."),
});

export type QuickQuoteInput = z.input<typeof schema>;

type SaveResult = { ok: boolean; quoteId?: string; number?: string; pdfUrl?: string; errors?: string[] };

/**
 * Crea o guarda una cotización rápida. Una rápida se edita en su propia
 * pantalla: guardarla no la convierte en una común ni le agrega textos.
 */
export async function saveQuickQuote(input: QuickQuoteInput): Promise<SaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const data = parsed.data;
  if (data.issue && !data.clientId && !data.clientName.trim())
    return { ok: false, errors: ["Elegí un cliente o escribí su nombre para generar el PDF."] };
  const free = data.items.filter((i) => !i.productId);
  if (free.some((i) => !i.name.trim())) return { ok: false, errors: ["Hay un ítem libre sin descripción."] };

  const productIds = [...new Set(data.items.map((i) => i.productId).filter((id): id is string => Boolean(id)))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, normalizedName: true, brand: { select: { name: true } }, ivaPercent: true },
  });
  if (products.length !== productIds.length) return { ok: false, errors: ["Hay productos que ya no existen."] };
  const profile = await prisma.quoteContentProfile.findUnique({ where: { key: data.profileKey } });
  if (!profile?.isActive) return { ok: false, errors: ["Ese tipo de documento ya no existe."] };
  const type = toDocumentType(profile);
  // Sin elegir: al crear toma la del tipo de documento o del cliente; al editar, la saca.
  const audience = data.audience === "auto" || (!data.audience && !data.quoteId) ? undefined : data.audience && (await isQuoteAudience(data.audience)) ? data.audience : null;

  let quoteId: string;
  let number: string;
  if (data.quoteId) {
    const loaded = await loadQuoteForEdit(data.quoteId);
    if (!loaded.quote) return { ok: false, errors: [loaded.blockedReason ?? "Sin acceso."] };
    quoteId = loaded.quote.id;
    number = loaded.quote.number;
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        clientId: data.clientId,
        clientName: data.clientId ? null : data.clientName.trim() || null,
        contactName: data.contactName || null,
        reference: data.reference.trim() || null,
        taxMode: data.taxMode,
        showProductPhotos: data.showProductPhotos,
        layoutKey: LAYOUT_BY_BASE[type.baseKey],
        isQuick: true,
      },
    });
    if (loaded.quote.contentProfileId !== profile.id || (audience !== undefined && audience !== loaded.quote.audience)) {
      await changeQuoteDocumentType({ quoteId, key: profile.key, ...(audience !== undefined ? { audience } : {}) });
    }
    // La planilla de la rápida se reescribe entera con lo que hay en pantalla.
    await prisma.quoteItem.deleteMany({ where: { quoteId } });
  } else {
    const { user, permissions } = await requireQuotePermission("quotes.create");
    void permissions;
    const quote = await createQuoteShell({
      ownerId: user.id,
      clientId: data.clientId,
      clientName: data.clientName.trim() || null,
      reference: data.reference.trim() || null,
      contactName: data.contactName || null,
      layoutKey: LAYOUT_BY_BASE[type.baseKey],
      profileKey: profile.key,
      ...(audience !== undefined ? { audience } : {}),
      taxMode: data.taxMode,
    });
    quoteId = quote.id;
    number = quote.number;
    await prisma.quote.update({
      where: { id: quoteId },
      data: { currency: "USD", showDeliveryColumn: false, isQuick: true, showProductPhotos: data.showProductPhotos },
    });
  }
  await prisma.quoteCommercialTerms.update({ where: { quoteId }, data: { validityDays: data.validityDays, pricesIn: "USD" } });

  const alternative = await prisma.quoteAlternative.findFirst({ where: { quoteId }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] });
  const defaultIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;
  const byId = new Map(products.map((p) => [p.id, p]));
  const idByUid = new Map<string, string>();
  let index = 0;
  for (const item of data.items) {
    const product = item.productId ? byId.get(item.productId) : null;
    const price = item.included ? 0 : item.unitPriceUsd * (1 - item.discountPercent / 100);
    const parentId = item.parentUid ? idByUid.get(item.parentUid) ?? null : null;
    const parentName = parentId ? data.items.find((i) => i.uid === item.parentUid) : null;
    const title = product ? [product.brand?.name, product.normalizedName].filter(Boolean).join(" — ") : item.name.trim();
    const created = await prisma.quoteItem.create({
      data: {
        quoteId,
        alternativeId: alternative?.id,
        productId: product?.id ?? null,
        kind: product ? "PRODUCT" : "SERVICE",
        quantity: new Prisma.Decimal(item.quantity),
        unit: "u",
        // La segunda línea sale en el editor y en el PDF: así el «sin cargo» se ve.
        description: [
          title,
          !product ? item.detail.trim() : "",
          item.included ? `Incluido sin cargo${parentName ? ` (con ${parentName.name || "el producto"})` : ""}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        unitPriceUsd: new Prisma.Decimal(price),
        lineTotalUsd: new Prisma.Decimal(price * item.quantity),
        priceOverridden: true,
        ivaRate: new Prisma.Decimal(product?.ivaPercent == null ? defaultIva : Number(product.ivaPercent)),
        source: "MANUAL",
        sortOrder: index,
        notes: item.note || (item.included ? "Incluido" : null),
        includedWithId: item.included ? parentId : null,
        includedPerUnit: item.included && parentId ? item.perParent ?? 1 : null,
      },
    });
    idByUid.set(item.uid, created.id);
    index += 1;
  }

  if (data.issue) {
    const fd = new FormData();
    fd.set("quoteId", quoteId);
    const issued = await issueQuote(fd);
    if (!issued.ok) return { ok: false, quoteId, number, errors: [issued.error || "No se pudo generar el PDF."] };
  }
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  const fresh = await prisma.quote.findUnique({ where: { id: quoteId }, select: { pdfBlobUrl: true } });
  return { ok: true, quoteId, number, pdfUrl: fresh?.pdfBlobUrl || undefined };
}

/** Lo que necesita la pantalla de la rápida para editar una cotización ya guardada. */
export async function loadQuickQuoteForEdit(quoteId: string) {
  const loaded = await loadQuoteForEdit(quoteId);
  if (!loaded.quote) return null;
  const q = loaded.quote;
  const items = [...q.items].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: q.id,
    number: q.number,
    status: q.status,
    pdfOutdated: q.pdfOutdated,
    clientId: q.clientId,
    clientName: q.clientName ?? "",
    contactName: q.contactName ?? "",
    reference: cleanQuoteReference(q.reference) ?? "",
    profileKey: q.contentProfile?.key ?? "resumido",
    audience: q.audience ?? "",
    taxMode: q.taxMode,
    validityDays: q.terms?.validityDays ?? 5,
    showProductPhotos: q.showProductPhotos,
    items: items.map((i) => {
      const [first, ...rest] = i.description.split("\n");
      const included = Boolean(i.includedWithId) || (Number(i.unitPriceUsd) === 0 && /incluido/i.test(`${i.notes ?? ""} ${rest.join(" ")}`));
      return {
        uid: i.id,
        productId: i.productId ?? "",
        free: !i.productId,
        name: i.product?.normalizedName ?? first ?? "",
        detail: !i.productId ? rest.filter((l) => !/^incluido sin cargo/i.test(l)).join("\n") : "",
        sku: null as string | null,
        quantity: Number(i.quantity),
        unitPriceUsd: Number(i.unitPriceUsd),
        discountPercent: 0,
        note: i.notes && i.notes !== "Incluido" ? i.notes : "",
        included,
        ivaPercent: Number(i.ivaRate),
        parentUid: i.includedWithId ?? undefined,
        perParent: i.includedPerUnit ?? undefined,
      };
    }),
  };
}

/** Compatibilidad: crear = guardar sin cotización previa. */
export async function createQuickQuote(input: QuickQuoteInput) {
  return saveQuickQuote({ ...input, quoteId: null });
}

export async function searchQuickQuoteProducts(query: string, clientId?: string | null) {
  await requireQuotePermission("quotes.create");
  if (query.trim().length < 2) return [];
  const q = query.trim();
  const found = await prisma.product.findMany({
    where: { isActive: true, ...buildProductSearchWhere(q) },
    take: 60,
    include: {
      brand: { select: { name: true } },
      images: { select: { url: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
      accessories: {
        where: { kind: { in: ["INCLUDED", "ACCESSORY"] } },
        include: {
          accessoryProduct: { select: { id: true, normalizedName: true, internalSku: true, ivaPercent: true } },
        },
      },
    },
  });
  const products = sortBySearchRelevance(found, q, (p) => ({
    normalizedName: p.normalizedName,
    originalName: p.originalName,
    internalSku: p.internalSku,
    supplierSku: p.supplierSku,
    modelNumber: p.modelNumber,
    manufacturerItem: p.manufacturerItem,
    brandName: p.brand?.name ?? null,
  })).slice(0, 20);
  // Mismo precio que cualquier otra cotización (lib/quote-unit-price).
  const unitPrices = await quoteUnitPrices(products, clientId || null);
  // Servicios para cotizar (instalación, visitas, horas…): primero, con su precio de venta.
  const services = (await searchQuoteServices(q)).map((s) => ({
    id: `svc:${s.id}`,
    name: s.name,
    subtitle: s.description ? s.description.slice(0, 140) : null,
    detail: s.description ?? "",
    sku: null as string | null,
    tango: null as string | null,
    brand: "Servicio" as string | null,
    imageUrl: null as string | null,
    stock: "UNKNOWN" as (typeof products)[number]["stockStatus"],
    price: s.priceUsd == null ? 0 : Number(s.priceUsd),
    needsPrice: s.priceUsd == null,
    ivaPercent: Number(s.ivaPercent) as number | null,
    accessories: [] as Array<{ id: string; name: string; sku: string | null; kind: string; ivaPercent: number | null; quantity: number }>,
  }));
  return [...services, ...products.map((p) => ({
    id: p.id,
    detail: "",
    needsPrice: false,
    name: productTitle(p),
    /** Descripción debajo del modelo (misma regla que el catálogo). */
    subtitle: productSubtitle(p),
    sku: p.internalSku,
    tango: tangoCode(p.internalSku),
    brand: p.brand?.name || null,
    imageUrl: p.images[0]?.url ?? null,
    stock: p.stockStatus,
    price: unitPrices.get(p.id) ?? 0,
    ivaPercent: p.ivaPercent == null ? null : Number(p.ivaPercent),
    accessories: p.accessories.map((a) => ({
      id: a.accessoryProduct.id,
      name: a.accessoryProduct.normalizedName,
      sku: a.accessoryProduct.internalSku,
      kind: a.kind,
      ivaPercent: a.accessoryProduct.ivaPercent == null ? null : Number(a.accessoryProduct.ivaPercent),
      /** Unidades incluidas por cada unidad del producto (ficha); 1 si no está cargado. */
      quantity: a.quantity && a.quantity > 0 ? a.quantity : 1,
    })),
  }))];
}

export async function resolveQuickQuoteSkus(lines: string, clientId?: string | null) {
  await requireQuotePermission("quotes.create");
  const parsed = lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\t, ]+/);
      return { sku: parts[0], quantity: Math.max(1, Math.round(Number(parts[1]) || 1)) };
    });
  const found = await Promise.all(
    parsed.map(async (entry) => ({
      entry,
      matches: await searchQuickQuoteProducts(entry.sku, clientId),
    })),
  );
  return {
    items: found.flatMap(({ entry, matches }) => {
      const exact =
        matches.find((p) => p.sku?.toLowerCase() === entry.sku.toLowerCase()) || matches[0];
      return exact ? [{ ...exact, quantity: entry.quantity }] : [];
    }),
    missing: found.filter(({ matches }) => !matches.length).map(({ entry }) => entry.sku),
  };
}
