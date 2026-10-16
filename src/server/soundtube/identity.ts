/**
 * Identidad visible de los productos de SoundTube y duplicados.
 *
 * Cuando un SKU de la lista Excel y un producto del portal son el mismo, el
 * usuario elige qué datos se muestran en el catálogo: los de la lista (SKU y
 * descripción del Excel, por defecto) o los del portal. El registro que queda
 * es siempre el del portal (fotos, fichas y stock se siguen actualizando con
 * el sync); si se eligió la lista, el sync respeta ese nombre, descripción y
 * modelo (`soundtube.identity`).
 *
 * Duplicados: producto creado desde la lista + producto del portal que son el
 * mismo. Al unirlos, el de la lista se oculta y su precio (costo + MUP) pasa al
 * del portal. Sin "use server": lo llaman acciones que ya validaron permisos.
 */

import { prisma } from "@/lib/prisma";
import { getSetting, setSetting } from "@/lib/settings";
import { buildProductSearchKey } from "@/lib/search-key";
import { looseSkuKey } from "@/services/soundtube/price-list-plan";
import { SOUNDTUBE_MUP_GROUP_ID } from "@/services/sync/connectors/soundtube";
import { addSkuAliases } from "./price-list-core";
import { SOUNDTUBE_IDENTITY_KEY, loadIdentityOverrides, type IdentityOverride } from "@/services/soundtube/identity-overrides";

const DISMISSED_KEY = "soundtube.duplicates_dismissed";
const MIN_PREFIX = 4;

export type VisibleSource = "excel" | "portal";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await getSetting(key, JSON.stringify(fallback))) as T;
  } catch {
    return fallback;
  }
}

async function saveIdentity(productId: string, identity: IdentityOverride | null): Promise<void> {
  const current = Object.fromEntries(await loadIdentityOverrides());
  if (identity) current[productId] = identity;
  else delete current[productId];
  await setSetting(SOUNDTUBE_IDENTITY_KEY, JSON.stringify(current), {
    description: "Productos SoundTube que muestran el SKU y la descripción de la lista Excel en vez de los del portal.",
  });
}

/**
 * Deja visible la versión elegida en el producto (del portal). "excel" pone
 * el SKU y la descripción de la lista; "portal" vuelve a los del portal en el
 * próximo sync (acá solo se borra la preferencia).
 */
export async function setVisibleIdentity(
  productId: string,
  source: VisibleSource,
  excel: { sku: string; description: string }
): Promise<void> {
  if (source === "portal") {
    await saveIdentity(productId, null);
    return;
  }
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { originalName: true, supplierSku: true, internalSku: true, manufacturerItem: true, brand: { select: { name: true } } },
  });
  if (!product) return;
  const identity: IdentityOverride = {
    name: excel.sku,
    originalName: excel.description.trim() || product.originalName,
    modelNumber: excel.sku,
  };
  await prisma.product.update({
    where: { id: productId },
    data: {
      normalizedName: identity.name,
      originalName: identity.originalName,
      modelNumber: identity.modelNumber,
      // Se puede buscar por el SKU de la lista y por el del portal.
      searchKey: buildProductSearchKey({
        internalSku: product.internalSku,
        supplierSku: product.supplierSku,
        normalizedName: identity.name,
        originalName: identity.originalName,
        modelNumber: identity.modelNumber,
        manufacturerItem: product.manufacturerItem,
        brandName: product.brand?.name,
      }),
    },
  });
  await saveIdentity(productId, identity);
}

export interface DuplicateSide {
  id: string;
  sku: string;
  title: string;
  brand: string;
  costUsd: number;
  hasImage: boolean;
}

export interface DuplicatePair {
  key: string;
  /** Creado desde la lista Excel (revisión). */
  excel: DuplicateSide;
  /** Traído del portal de SoundTube. */
  portal: DuplicateSide;
}

const pairKey = (excelId: string, portalId: string) => `${excelId}:${portalId}`;

/**
 * Pares "producto creado desde la lista" + "producto del portal" activos cuyo
 * SKU es el mismo ignorando espacios/guiones o uno empieza con el otro
 * (PS1090a ↔ PS1090a-BK). Excluye los que el usuario marcó como distintos.
 */
export async function findDuplicates(): Promise<DuplicatePair[]> {
  const [fromExcel, fromPortal, dismissed] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Product" WHERE "isActive" = true AND ("sourceMetadata"->'soundtubeReview') IS NOT NULL`,
    prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Product" WHERE "isActive" = true AND ("sourceMetadata"->'soundtube') IS NOT NULL`,
    readJson<string[]>(DISMISSED_KEY, []),
  ]);
  if (!fromExcel.length || !fromPortal.length) return [];
  const select = { id: true, supplierSku: true, normalizedName: true, originalName: true, baseCostUsd: true, images: { select: { id: true }, take: 1 }, brand: { select: { name: true } } } as const;
  const [excelRows, portalRows] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: fromExcel.map((r) => r.id) } }, select }),
    prisma.product.findMany({ where: { id: { in: fromPortal.map((r) => r.id) } }, select }),
  ]);
  const side = (p: (typeof excelRows)[number]): DuplicateSide => ({
    id: p.id,
    sku: p.supplierSku ?? p.normalizedName,
    title: p.originalName || p.normalizedName,
    brand: p.brand?.name ?? "—",
    costUsd: Number(p.baseCostUsd),
    hasImage: p.images.length > 0,
  });
  const skip = new Set(dismissed);
  const pairs: DuplicatePair[] = [];
  for (const e of excelRows) {
    const ek = looseSkuKey(e.supplierSku ?? e.normalizedName);
    if (ek.length < MIN_PREFIX) continue;
    for (const p of portalRows) {
      if (p.id === e.id) continue;
      const pk = looseSkuKey(p.supplierSku ?? p.normalizedName);
      if (pk.length < MIN_PREFIX || !(pk === ek || pk.startsWith(ek) || ek.startsWith(pk))) continue;
      const key = pairKey(e.id, p.id);
      if (!skip.has(key)) pairs.push({ key, excel: side(e), portal: side(p) });
    }
  }
  return pairs.sort((a, b) => a.excel.sku.localeCompare(b.excel.sku));
}

/** "Son productos distintos": no se vuelve a preguntar. */
export async function dismissDuplicate(excelId: string, portalId: string): Promise<void> {
  const current = new Set(await readJson<string[]>(DISMISSED_KEY, []));
  current.add(pairKey(excelId, portalId));
  await setSetting(DISMISSED_KEY, JSON.stringify([...current]), {
    description: "Pares de productos SoundTube que el usuario marcó como distintos.",
  });
}

/**
 * Une un duplicado: queda el producto del portal (con la identidad elegida)
 * con el costo y el MUP de la lista; el creado desde la lista se oculta.
 */
export async function mergeDuplicate(excelId: string, portalId: string, show: VisibleSource): Promise<void> {
  const [excel, rule] = await Promise.all([
    prisma.product.findUnique({
      where: { id: excelId },
      select: { supplierSku: true, normalizedName: true, originalName: true, shortDescription: true, baseCostUsd: true, requiresQuote: true, sourceMetadata: true },
    }),
    prisma.marginRule.findFirst({ where: { groupId: SOUNDTUBE_MUP_GROUP_ID, productId: excelId } }),
  ]);
  if (!excel) throw new Error("No existe el producto de la lista.");
  const excelSku = excel.supplierSku ?? excel.normalizedName;
  const meta = (excel.sourceMetadata && typeof excel.sourceMetadata === "object" ? excel.sourceMetadata : {}) as Record<string, unknown>;

  await prisma.$transaction([
    // El precio de la lista pasa al producto del portal.
    prisma.product.update({
      where: { id: portalId },
      data: { baseCostUsd: excel.baseCostUsd, requiresQuote: Number(excel.baseCostUsd) > 0 ? false : excel.requiresQuote },
    }),
    prisma.marginRule.deleteMany({ where: { groupId: SOUNDTUBE_MUP_GROUP_ID, productId: portalId } }),
    ...(rule
      ? [
          prisma.marginRule.update({
            where: { id: rule.id },
            data: { productId: portalId, scopeId: portalId },
          }),
        ]
      : []),
    // El de la lista se oculta (no se borra: puede estar en cotizaciones viejas).
    prisma.product.update({
      where: { id: excelId },
      data: { isActive: false, sourceMetadata: { ...meta, mergedInto: portalId, mergedAt: new Date().toISOString() } },
    }),
  ]);
  // Las próximas listas actualizan el producto del portal.
  await addSkuAliases([{ excelSku, productId: portalId }]);
  await setVisibleIdentity(portalId, show, { sku: excelSku, description: excel.originalName || excel.shortDescription || "" });
}

