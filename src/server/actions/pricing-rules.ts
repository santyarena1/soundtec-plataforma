"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { familyScopeProductWhere } from "@/lib/pricing";
import { requireStaff } from "@/lib/auth-helpers";
import { RuleScopeType } from "@prisma/client";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";
import { expandCategoryIds, listCategoryTree, type CategoryNode } from "@/lib/category-tree";
import type { RuleTarget } from "@/lib/pricing-scope";
import { describeRuleScope, parseRule, saveRuleError } from "@/server/pricing/rule-save";
import { validateRubroIds } from "@/server/categories/rubros";
import { proposeOrApplyRename, proposePriceReview, type ProposedReview } from "@/server/price-review/reviews";
import type { PriceOperation, RuleKind } from "@/lib/price-review/operations";

function revalidatePricing() {
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/margins");
  revalidatePath("/admin/products");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/price-reviews");
  revalidatePath("/portal/products");
}

function rethrowIfRedirect(err: unknown) {
  const digest = err && typeof err === "object" && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  if (digest.includes("NEXT_REDIRECT") || digest.includes("NEXT_NOT_FOUND")) throw err;
}

/**
 * `applied`: se guardó directo (cambio solo de nombre, no mueve precios).
 * `unchanged`: no había nada distinto para guardar.
 */
export type RuleSaveResult = { ok: boolean; error?: string; review?: ProposedReview; applied?: boolean; unchanged?: boolean };

const SCOPE_BY_KIND = { margin: "margins.manage", discount: "discounts.manage" } as const;

function actorOf(user: { id: string; name?: string | null; email?: string | null }) {
  return { id: user.id, name: user.name ?? user.email ?? null };
}

/**
 * Alta o edición de una regla de margen/descuento. NO se aplica directo: se
 * simula con la cadena de precios y queda en «Revisión de cambios» con la
 * lista de productos que se moverían. Si no mueve nada se aplica con un clic.
 */
async function proposeRuleSave(kind: RuleKind, formData: FormData): Promise<RuleSaveResult> {
  const { user } = await requireStaff(SCOPE_BY_KIND[kind], { costs: true });
  const parsed = parseRule(formData, kind);
  if (!parsed.ok) return parsed;
  if (parsed.data.target === "CATEGORY") {
    const ids = parsed.data.combos.map((c) => c.scopeId).filter((id): id is string => Boolean(id));
    const valid = await validateRubroIds(prisma, ids);
    if (!valid.ok) return { ok: false, error: valid.error };
  }
  const form: Array<[string, string]> = [];
  formData.forEach((value, key) => {
    if (typeof value === "string") form.push([key, value]);
  });
  const op: PriceOperation = { type: "rule.save", kind, form };
  const editing = Boolean(formData.get("id"));
  const scopeIds = [...new Set(parsed.data.combos.map((c) => c.scopeId).filter((id): id is string => Boolean(id)))];
  const clientCount = new Set(parsed.data.combos.map((c) => c.clientId).filter(Boolean)).size;
  const valueText =
    kind === "discount"
      ? `${parsed.data.rawValue} %`
      : parsed.data.mode === "markup"
        ? `markup ×${parsed.data.rawValue}`
        : `margen ${parsed.data.rawValue} %`;
  const scopeText = await describeRuleScope(prisma, parsed.data.target, scopeIds);
  const title = `${editing ? "Editar" : "Nueva"} ${kind === "margin" ? "regla de margen" : "regla de descuento"}: ${valueText} · ${scopeText} · ${clientCount ? `${clientCount} cliente${clientCount === 1 ? "" : "s"}` : "todos los clientes"}${parsed.data.isActive ? "" : " (inactiva)"}`;
  try {
    // Solo cambió el nombre: no mueve precios, se guarda directo (queda registrado como aplicado).
    const outcome = editing
      ? await proposeOrApplyRename(
          op,
          { rename: `Renombrar ${kind === "margin" ? "regla de margen" : "regla de descuento"}: ${parsed.data.name}`, review: title },
          actorOf(user)
        )
      : { applied: false as const, review: await proposePriceReview(op, title, actorOf(user)) };
    if (outcome.applied) {
      if ("unchanged" in outcome && outcome.unchanged) return { ok: true, applied: true, unchanged: true };
      revalidatePricing();
      return { ok: true, applied: true };
    }
    const review = outcome.review;
    revalidatePendingViews(kind);
    return { ok: true, review };
  } catch (err) {
    rethrowIfRedirect(err);
    console.error("proposeRuleSave", err);
    return { ok: false, error: err instanceof Error && /TOO_MANY/.test(err.message) ? saveRuleError(err) : err instanceof Error && !/prisma|invocation/i.test(err.message) && err.message.length < 200 ? err.message : saveRuleError(err) };
  }
}

export async function upsertMarginRule(formData: FormData): Promise<RuleSaveResult> {
  return proposeRuleSave("margin", formData);
}

export async function upsertDiscountRule(formData: FormData): Promise<RuleSaveResult> {
  return proposeRuleSave("discount", formData);
}

/** Lo que muestra «pendiente de revisión»: la revisión y la pantalla de la regla. */
function revalidatePendingViews(kind: RuleKind) {
  revalidatePath("/admin/price-reviews");
  revalidatePath(kind === "margin" ? "/admin/margins" : "/admin/discounts");
  revalidatePath("/admin/clients", "layout");
}

export type RuleReviewResult = { ok: true; review: ProposedReview } | { ok: false; error: string };

const ruleRefSchema = z.object({
  kind: z.enum(["margin", "discount"]),
  ids: z.array(z.string().min(1)).max(500).optional(),
  groupId: z.string().min(1).optional(),
});

async function findRules(kind: RuleKind, where: { id?: { in: string[] }; groupId?: string }) {
  return kind === "margin"
    ? prisma.marginRule.findMany({ where, select: { id: true, name: true, isActive: true } })
    : prisma.discountRule.findMany({ where, select: { id: true, name: true, isActive: true } });
}

/**
 * Borrar una regla, varias o un grupo entero (con sus excepciones). No se borra
 * directo: queda en Revisión de cambios y la tabla la marca como pendiente.
 */
export async function proposeRuleRemoval(input: { kind: RuleKind; ids?: string[]; groupId?: string }): Promise<RuleReviewResult> {
  const parsed = ruleRefSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.ids?.length && !parsed.data.groupId)) return { ok: false, error: "Elegí qué regla borrar." };
  const { kind, ids, groupId } = parsed.data;
  const { user } = await requireStaff(SCOPE_BY_KIND[kind], { costs: true });
  try {
    const rows = await findRules(kind, groupId ? { groupId } : { id: { in: ids! } });
    if (!rows.length) return { ok: false, error: "La regla ya no existe. Recargá la página." };
    const title = `Borrar ${kind === "margin" ? "regla de margen" : "regla de descuento"}: ${rows[0].name}${rows.length > 1 ? ` (y ${rows.length - 1} subreglas)` : ""}`;
    const review = await proposePriceReview({ type: "rules.delete", kind, ids: rows.map((r) => r.id).sort() }, title, actorOf(user));
    revalidatePendingViews(kind);
    return { ok: true, review };
  } catch (err) {
    console.error("proposeRuleRemoval", err);
    return { ok: false, error: "No se pudo calcular el impacto del borrado. Probá de nuevo." };
  }
}

/** Activar o desactivar reglas (una o un grupo) desde la tabla: también pasa por Revisión de cambios. */
export async function proposeRulesActive(input: { kind: RuleKind; ids?: string[]; groupId?: string; active: boolean }): Promise<RuleReviewResult> {
  const parsed = ruleRefSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.ids?.length && !parsed.data.groupId) || typeof input.active !== "boolean") {
    return { ok: false, error: "Elegí qué regla cambiar." };
  }
  const { kind, ids, groupId } = parsed.data;
  const { user } = await requireStaff(SCOPE_BY_KIND[kind], { costs: true });
  try {
    // El grupo entero incluye sus excepciones: tienen que quedar igual que las reglas.
    const rows = await findRules(kind, groupId ? { groupId } : { id: { in: ids! } });
    const targets = rows.filter((r) => r.isActive !== input.active);
    if (!targets.length) return { ok: false, error: input.active ? "Ya está activa." : "Ya está inactiva." };
    const title = `${input.active ? "Activar" : "Desactivar"} ${kind === "margin" ? "regla de margen" : "regla de descuento"}: ${rows[0].name}${rows.length > 1 ? ` (y ${rows.length - 1} subreglas)` : ""}`;
    const review = await proposePriceReview(
      { type: "rules.update", kind, ids: targets.map((r) => r.id).sort(), data: { isActive: input.active } },
      title,
      actorOf(user)
    );
    revalidatePendingViews(kind);
    return { ok: true, review };
  } catch (err) {
    console.error("proposeRulesActive", err);
    return { ok: false, error: "No se pudo calcular el impacto. Probá de nuevo." };
  }
}

/**
 * Productos para el selector «Producto(s)» de las reglas. Se piden recién cuando
 * se elige ese alcance (antes viajaban ~3.600 nombres con cada carga de la pantalla).
 */
export async function listRuleProductOptions(): Promise<Array<{ id: string; normalizedName: string }>> {
  await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  return prisma.product.findMany({
    orderBy: { normalizedName: "asc" },
    select: { id: true, normalizedName: true },
    take: 6000,
  });
}

/** Árbol de rubros para el selector de las reglas y los filtros de «Por producto» (se pide al usarlo). */
export async function listRuleCategoryTree(): Promise<CategoryNode[]> {
  await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  return listCategoryTree();
}

export type RulePreviewProduct = {
  id: string;
  name: string;
  sku: string | null;
  brandName: string | null;
  imageUrl: string | null;
};

function mapPreviewProduct(row: {
  id: string;
  normalizedName: string;
  internalSku: string | null;
  brand: { name: string } | null;
  images: { url: string }[];
}): RulePreviewProduct {
  return {
    id: row.id,
    name: row.normalizedName,
    sku: row.internalSku,
    brandName: row.brand?.name ?? null,
    imageUrl: row.images[0]?.url ?? null,
  };
}

export async function searchRulePreviewProducts(input: {
  q?: string;
  target: RuleTarget;
  scopeIds: string[];
  hydrateIds?: string[];
  take?: number;
}): Promise<
  | { ok: true; items: RulePreviewProduct[]; total: number; hydrated: RulePreviewProduct[] }
  | { ok: false; error: string }
> {
  await requireStaff(["margins.manage", "discounts.manage", "visibility.manage"]);
  const target = input.target;
  const scopeIds = [...new Set((input.scopeIds || []).filter(Boolean))];
  if (target !== "ALL" && scopeIds.length === 0) {
    return { ok: true, items: [], total: 0, hydrated: [] };
  }

  const take = Math.min(Math.max(input.take || 200, 1), 200);
  const q = (input.q || "").trim();

  const scopeWhere =
    target === "BRAND"
      ? { brandId: { in: scopeIds } }
      : target === "FAMILY"
        ? await familyScopeProductWhere(scopeIds)
        : target === "CATEGORY"
          ? { categoryId: { in: await expandCategoryIds(scopeIds) } }
          : target === "LINE"
            ? { lineId: { in: scopeIds } }
          : target === "DISTRIBUTOR"
            ? { distributorId: { in: scopeIds } }
            : target === "PRODUCT"
              ? { id: { in: scopeIds } }
              : {};

  const { buildProductSearchWhere } = await import("@/lib/product-search");
  const searchWhere = q ? buildProductSearchWhere(q) : {};

  const where = {
    AND: [scopeWhere, searchWhere].filter((part) => Object.keys(part).length > 0),
  };

  const select = {
    id: true,
    normalizedName: true,
    internalSku: true,
    brand: { select: { name: true } },
    images: {
      orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
      take: 1,
      select: { url: true },
    },
  };

  const hydrateIds = [...new Set((input.hydrateIds || []).filter(Boolean))].slice(0, 400);

  const [total, rows, hydratedRows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { normalizedName: "asc" },
      take,
      select,
    }),
    hydrateIds.length
      ? prisma.product.findMany({
          where: { id: { in: hydrateIds } },
          orderBy: { normalizedName: "asc" },
          select,
        })
      : Promise.resolve([]),
  ]);

  return {
    ok: true,
    items: rows.map(mapPreviewProduct),
    total,
    hydrated: hydratedRows.map(mapPreviewProduct),
  };
}

export async function clearProductDiscount(formData: FormData): Promise<void> {
  await requireStaff("discounts.manage", { costs: true });
  const id = String(formData.get("productId") || "");
  if (!id) return;
  await prisma.product.update({
    where: { id },
    data: { discountPercent: null },
  });
  revalidatePricing();
  revalidatePath(`/admin/products/${id}`);
  revalidatePath(`/portal/products/${id}`);
}

/** «Quitar todos» los descuentos de producto: mueve muchos precios, pasa por Revisión de cambios. */
export async function clearAllProductDiscounts(): Promise<{ ok: boolean; count: number; reviewId?: string }> {
  const { user } = await requireStaff("discounts.manage", { costs: true });
  const rows = await prisma.product.findMany({ where: { discountPercent: { gt: 0 } }, select: { id: true } });
  if (!rows.length) return { ok: true, count: 0 };
  const review = await proposePriceReview(
    { type: "products.setDiscount", productIds: rows.map((r) => r.id), discountPercent: null },
    `Quitar el descuento propio de ${rows.length} productos`,
    actorOf(user)
  );
  revalidatePricing();
  return { ok: true, count: 0, reviewId: review.id };
}

export async function clearManufacturerPromo(formData: FormData): Promise<void> {
  await requireStaff("discounts.manage", { costs: true });
  const id = String(formData.get("productId") || "");
  if (!id) return;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { badges: true },
  });
  if (!product) return;
  await prisma.product.update({
    where: { id },
    data: {
      salePriceLabel: null,
      salePriceUsd: null,
      salePriceStartsAt: null,
      salePriceEndsAt: null,
      ...(Array.isArray(product.badges)
        ? { badges: product.badges.filter((badge) => !isManufacturerPromoLabel(badgeLabel(badge))) }
        : {}),
    },
  });
  revalidatePricing();
  revalidatePath(`/admin/products/${id}`);
  revalidatePath(`/portal/products/${id}`);
}

export async function clearAllManufacturerPromos(): Promise<{ ok: boolean; count: number }> {
  await requireStaff("discounts.manage", { costs: true });
  const products = await prisma.product.findMany({
    where: {
      OR: [{ salePriceLabel: { not: null } }, { salePriceUsd: { gt: 0 } }],
    },
    select: { id: true, badges: true },
  });
  for (const product of products) {
    const nextBadges = Array.isArray(product.badges)
      ? product.badges.filter((badge) => !isManufacturerPromoLabel(badgeLabel(badge)))
      : undefined;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        salePriceLabel: null,
        salePriceUsd: null,
        salePriceStartsAt: null,
        salePriceEndsAt: null,
        ...(nextBadges ? { badges: nextBadges } : {}),
      },
    });
  }
  revalidatePricing();
  return { ok: true, count: products.length };
}


const visibilitySchema = z.object({
  clientId: z.string().min(1),
  scopeType: z.nativeEnum(RuleScopeType),
  scopeIds: z.array(z.string().min(1)).min(1),
  canView: z.coerce.boolean().default(false),
});

/**
 * Crea o actualiza reglas de visibilidad para varios recursos a la vez.
 * Acepta múltiples scopeIds para que el admin pueda ocultar/permitir varias
 * marcas, categorías, etc., en una sola operación.
 */
export async function upsertVisibility(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireStaff("visibility.manage");
  const id = formData.get("id")?.toString() || undefined;
  const rawIds = formData.getAll("scopeIds").map((v) => String(v)).filter(Boolean);
  // Compat con el campo viejo `scopeId` (single-select).
  const legacyId = String(formData.get("scopeId") || "");
  const scopeIds = rawIds.length > 0 ? rawIds : legacyId ? [legacyId] : [];

  const parsed = visibilitySchema.safeParse({
    clientId: formData.get("clientId"),
    scopeType: formData.get("scopeType"),
    scopeIds,
    canView: formData.get("canView") === "on" || formData.get("canView") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisá el cliente y los recursos." };
  }
  if (parsed.data.scopeType === "CATEGORY") {
    const valid = await validateRubroIds(prisma, parsed.data.scopeIds);
    if (!valid.ok) return { ok: false, error: valid.error };
  }

  if (id) {
    const scopeId = parsed.data.scopeIds[0] || null;
    await prisma.visibilityRule.update({
      where: { id },
      data: {
        clientId: parsed.data.clientId,
        scopeType: parsed.data.scopeType,
        scopeId,
        canView: parsed.data.canView,
        productId: parsed.data.scopeType === "PRODUCT" ? scopeId : null,
      },
    });
  } else {
    for (const scopeId of parsed.data.scopeIds) {
      const existing = await prisma.visibilityRule.findFirst({
        where: {
          clientId: parsed.data.clientId,
          scopeType: parsed.data.scopeType,
          scopeId,
        },
      });
      if (existing) {
        await prisma.visibilityRule.update({
          where: { id: existing.id },
          data: { canView: parsed.data.canView },
        });
      } else {
        await prisma.visibilityRule.create({
          data: {
            clientId: parsed.data.clientId,
            scopeType: parsed.data.scopeType,
            scopeId,
            canView: parsed.data.canView,
            productId: parsed.data.scopeType === "PRODUCT" ? scopeId : null,
          },
        });
      }
    }
  }
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath(`/admin/users/${parsed.data.clientId}`);
  revalidatePath("/portal/products");
  return { ok: true };
}

export async function toggleVisibilityCanView(formData: FormData): Promise<void> {
  await requireStaff("visibility.manage");
  const id = String(formData.get("id") || "");
  if (!id) return;
  const rule = await prisma.visibilityRule.findUnique({ where: { id }, select: { canView: true } });
  if (!rule) return;
  await prisma.visibilityRule.update({
    where: { id },
    data: { canView: !rule.canView },
  });
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/portal/products");
}

export async function deleteVisibility(formData: FormData): Promise<void> {
  await requireStaff("visibility.manage");
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.visibilityRule.delete({ where: { id } });
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/portal/products");
}
