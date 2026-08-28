"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { familyScopeProductWhere } from "@/lib/pricing";
import { requireAdmin } from "@/lib/auth-helpers";
import { RuleScopeType } from "@prisma/client";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";
import {
  autoPriority,
  autoRuleName,
  markupToMarginPercent,
  resolveRuleScope,
  type RuleTarget,
} from "@/lib/pricing-scope";

function revalidatePricing() {
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/margins");
  revalidatePath("/admin/products");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/admin/visibility");
  revalidatePath("/portal/products");
}

const ruleSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  audience: z.enum(["all", "client"]).optional(),
  target: z.enum(["ALL", "BRAND", "PRODUCT", "CATEGORY", "FAMILY", "DISTRIBUTOR"]).optional(),
  scopeType: z.nativeEnum(RuleScopeType).optional(),
  scopeId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  percent: z.coerce.number().min(-100).max(1000),
  pricingMode: z.enum(["margin", "markup"]).optional(),
  isActive: z.coerce.boolean().optional(),
});

function formIds(formData: FormData, many: string, one: string) {
  const fromMany = formData.getAll(many).map((value) => String(value)).filter(Boolean);
  const fromOne = String(formData.get(one) || "");
  return fromMany.length > 0 ? fromMany : fromOne ? [fromOne] : [];
}

function parseRule(formData: FormData, kind: "margin" | "discount") {
  const parsed = ruleSchema.safeParse({
    name: formData.get("name") || "",
    audience: formData.get("audience") || undefined,
    target: formData.get("target") || undefined,
    scopeType: formData.get("scopeType") || undefined,
    scopeId: formData.get("scopeId") || formData.get("scopeIds") || null,
    clientId: formData.get("clientId") || formData.get("clientIds") || null,
    percent: formData.get("percent"),
    pricingMode: formData.get("pricingMode") || "margin",
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Revisá a quién aplica y el valor." };
  }

  const audience = parsed.data.audience;
  const target = (parsed.data.target as RuleTarget | undefined) || undefined;
  const clientIds =
    audience === "all" ? [null] : formIds(formData, "clientIds", "clientId").map((id) => id as string | null);
  const scopeIds = target === "ALL" ? [null] : formIds(formData, "scopeIds", "scopeId").map((id) => id as string | null);

  if (audience === "client" && clientIds.filter(Boolean).length === 0) {
    return { ok: false as const, error: "Elegí al menos un cliente." };
  }
  if (target && target !== "ALL" && scopeIds.filter(Boolean).length === 0) {
    return { ok: false as const, error: "Elegí al menos una marca, familia o recurso." };
  }

  const combos =
    audience && target
      ? clientIds.flatMap((clientId) => scopeIds.map((scopeId) => ({ clientId, scopeId })))
      : null;
  if (combos && combos.length > 400) {
    return { ok: false as const, error: "Elegiste demasiadas combinaciones (máximo 400). Filtrá un poco." };
  }

  let scopeType: RuleScopeType;
  let clientId: string | null;
  let scopeId: string | null;

  if (audience && target) {
    const first = combos![0];
    const resolved = resolveRuleScope({
      audience,
      target,
      clientId: first.clientId,
      scopeId: first.scopeId,
    });
    if (!resolved.ok) return resolved;
    scopeType = resolved.scopeType;
    clientId = resolved.clientId;
    scopeId = resolved.scopeId;
  } else if (parsed.data.scopeType) {
    scopeType = parsed.data.scopeType;
    clientId = parsed.data.clientId || null;
    scopeId = parsed.data.scopeId || null;
    if (scopeType === "GLOBAL" && clientId) scopeType = "CLIENT";
    if (scopeType === "CLIENT" && !clientId) {
      return { ok: false as const, error: "Elegí un cliente." };
    }
  } else {
    return { ok: false as const, error: "Indicá a quién aplica la regla." };
  }

  const mode = parsed.data.pricingMode === "markup" ? "markup" : "margin";
  let marginPercent = parsed.data.percent;
  let markupMultiplier: number | null = null;
  if (kind === "margin" && mode === "markup") {
    if (parsed.data.percent <= 0 || parsed.data.percent > 20) {
      return { ok: false as const, error: "El markup tiene que ser un multiplicador (ej. 2.75 = costo × 2.75)." };
    }
    markupMultiplier = parsed.data.percent;
    marginPercent = markupToMarginPercent(parsed.data.percent);
    if (marginPercent > 999.999) marginPercent = 999.999;
    if (marginPercent < -999.999) marginPercent = -999.999;
  } else if (kind === "margin") {
    markupMultiplier = null;
    marginPercent = parsed.data.percent;
  }

  const name =
    (parsed.data.name || "").trim() ||
    autoRuleName({
      kind,
      mode,
      value: parsed.data.percent,
      audience: clientId ? "client" : "all",
      target: target || (scopeType === "GLOBAL" || scopeType === "CLIENT" ? "ALL" : (scopeType as RuleTarget)),
    });

  return {
    ok: true as const,
    data: {
      name,
      customName: (parsed.data.name || "").trim(),
      mode,
      rawValue: parsed.data.percent,
      kind,
      audience: (audience || (clientId ? "client" : "all")) as "all" | "client",
      target: target || (scopeType === "GLOBAL" || scopeType === "CLIENT" ? "ALL" : (scopeType as RuleTarget)),
      priority: autoPriority(scopeType, Boolean(clientId)),
      scopeType,
      scopeId,
      clientId,
      productId: scopeType === "PRODUCT" ? scopeId : null,
      percent: marginPercent,
      markupMultiplier,
      isActive: parsed.data.isActive ?? true,
      combos: combos || [{ clientId, scopeId }],
    },
  };
}

async function resourceNameMap(target: RuleTarget, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const select = { id: true, name: true };
  const rows =
    target === "BRAND"
      ? await prisma.brand.findMany({ where: { id: { in: ids } }, select })
      : target === "DISTRIBUTOR"
        ? await prisma.distributor.findMany({ where: { id: { in: ids } }, select })
        : target === "CATEGORY"
          ? await prisma.category.findMany({ where: { id: { in: ids } }, select })
          : target === "FAMILY"
            ? await prisma.productFamily.findMany({ where: { id: { in: ids } }, select })
            : target === "PRODUCT"
              ? (await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, normalizedName: true } })).map(
                  (row) => ({ id: row.id, name: row.normalizedName })
                )
              : [];
  return new Map(rows.map((row) => [row.id, row.name]));
}

function newGroupId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `grp_${uuid.replace(/-/g, "")}`;
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function saveRuleError(err: unknown) {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "P2000" || code === "P2020" || /out of range|numeric value|Decimal/i.test(message)) {
    return "El markup es demasiado alto para cómo estaba la base. Recargá la página e intentá de nuevo.";
  }
  if (code === "P2022" || /column|groupId|isExemption|does not exist/i.test(message)) {
    return "Falta un campo nuevo en la base. Recargá en un minuto, cuando termine el deploy.";
  }
  if (message === "TOO_MANY_EXEMPTIONS" || /TOO_MANY_EXEMPTIONS/.test(message)) {
    return "Exceptuaste demasiados productos (máximo 400 combinaciones). Filtrá un poco.";
  }
  return "No se pudo guardar la regla. Probá de nuevo.";
}

async function saveRuleRows(
  kind: "margin" | "discount",
  parsed: Extract<ReturnType<typeof parseRule>, { ok: true }>,
  options: { id?: string; groupId?: string; replaceGroup?: boolean; excludeProductIds?: string[] }
) {
  const combos = parsed.data.combos;
  const excludeProductIds =
    parsed.data.target === "PRODUCT"
      ? []
      : [...new Set((options.excludeProductIds || []).filter(Boolean))];
  const scopeIds = combos.map((combo) => combo.scopeId).filter((value): value is string => Boolean(value));
  const clientIds = combos.map((combo) => combo.clientId).filter((value): value is string => Boolean(value));
  const [resources, clients] = await Promise.all([
    resourceNameMap(parsed.data.target, scopeIds),
    clientIds.length
      ? prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, companyName: true, contactName: true },
        })
      : Promise.resolve([]),
  ]);
  const clientNames = new Map(clients.map((row) => [row.id, row.companyName || row.contactName || row.id]));

  function comboKey(clientId: string | null, scopeId: string | null) {
    return `${clientId || ""}::${scopeId || ""}`;
  }

  const needsGroup = combos.length > 1 || excludeProductIds.length > 0;
  let groupId = options.groupId || null;
  if (options.replaceGroup && !groupId && options.id) {
    const current =
      kind === "margin"
        ? await prisma.marginRule.findUnique({ where: { id: options.id }, select: { groupId: true } })
        : await prisma.discountRule.findUnique({ where: { id: options.id }, select: { groupId: true } });
    groupId = current?.groupId || null;
  }
  if (options.replaceGroup) {
    if (!groupId) groupId = newGroupId();
    const existing =
      kind === "margin"
        ? await prisma.marginRule.findMany({ where: { groupId } })
        : await prisma.discountRule.findMany({ where: { groupId } });
    const existingByKey = new Map(
      existing.filter((row) => !row.isExemption).map((row) => [comboKey(row.clientId, row.scopeId), row.id])
    );
    const keep = new Set<string>();
    for (const combo of combos) {
      const resolved = resolveRuleScope({
        audience: parsed.data.audience,
        target: parsed.data.target,
        clientId: combo.clientId,
        scopeId: combo.scopeId,
      });
      if (!resolved.ok) continue;
      const generated = autoRuleName({
        kind: parsed.data.kind,
        mode: parsed.data.mode === "markup" ? "markup" : "margin",
        value: parsed.data.rawValue,
        audience: parsed.data.audience,
        clientName: combo.clientId ? clientNames.get(combo.clientId) : null,
        target: parsed.data.target,
        resourceName: combo.scopeId ? resources.get(combo.scopeId) : null,
      });
      const name = parsed.data.customName || generated;
      const base = {
        name,
        priority: autoPriority(resolved.scopeType, Boolean(resolved.clientId)),
        scopeType: resolved.scopeType,
        scopeId: resolved.scopeId,
        clientId: resolved.clientId,
        productId: resolved.scopeType === "PRODUCT" ? resolved.scopeId : null,
        isActive: parsed.data.isActive,
        groupId,
        isExemption: false,
      };
      const key = comboKey(resolved.clientId, resolved.scopeId);
      const existingId = existingByKey.get(key);
      if (kind === "margin") {
        const data = { ...base, marginPercent: parsed.data.percent, markupMultiplier: parsed.data.markupMultiplier };
        if (existingId) await prisma.marginRule.update({ where: { id: existingId }, data });
        else await prisma.marginRule.create({ data });
      } else {
        const data = { ...base, discountPercent: parsed.data.percent };
        if (existingId) await prisma.discountRule.update({ where: { id: existingId }, data });
        else await prisma.discountRule.create({ data });
      }
      keep.add(key);
    }
    for (const row of existing) {
      if (row.isExemption) continue;
      if (keep.has(comboKey(row.clientId, row.scopeId))) continue;
      if (kind === "margin") await prisma.marginRule.delete({ where: { id: row.id } });
      else await prisma.discountRule.delete({ where: { id: row.id } });
    }
    const exemptionCount = await syncExemptionRows(kind, groupId, parsed, excludeProductIds, clientNames);
    return combos.length + exemptionCount;
  }

  if (!groupId && needsGroup) groupId = newGroupId();
  if (!groupId && options.id) {
    const current =
      kind === "margin"
        ? await prisma.marginRule.findUnique({ where: { id: options.id }, select: { groupId: true } })
        : await prisma.discountRule.findUnique({ where: { id: options.id }, select: { groupId: true } });
    groupId = current?.groupId || (needsGroup ? newGroupId() : null);
    if (needsGroup && !groupId) groupId = newGroupId();
  }

  let usedOriginal = false;
  for (const combo of combos) {
    const resolved = resolveRuleScope({
      audience: parsed.data.audience,
      target: parsed.data.target,
      clientId: combo.clientId,
      scopeId: combo.scopeId,
    });
    if (!resolved.ok) continue;
    const generated = autoRuleName({
      kind: parsed.data.kind,
      mode: parsed.data.mode === "markup" ? "markup" : "margin",
      value: parsed.data.rawValue,
      audience: parsed.data.audience,
      clientName: combo.clientId ? clientNames.get(combo.clientId) : null,
      target: parsed.data.target,
      resourceName: combo.scopeId ? resources.get(combo.scopeId) : null,
    });
    const name =
      parsed.data.customName && combos.length === 1
        ? parsed.data.customName
        : parsed.data.customName
          ? `${parsed.data.customName} · ${combo.scopeId ? resources.get(combo.scopeId) || "recurso" : clientNames.get(combo.clientId || "") || "catálogo"}`.slice(0, 200)
          : generated;

    const base = {
      name,
      priority: autoPriority(resolved.scopeType, Boolean(resolved.clientId)),
      scopeType: resolved.scopeType,
      scopeId: resolved.scopeId,
      clientId: resolved.clientId,
      productId: resolved.scopeType === "PRODUCT" ? resolved.scopeId : null,
      isActive: parsed.data.isActive,
      groupId,
      isExemption: false,
    };

    if (kind === "margin") {
      const data = {
        ...base,
        marginPercent: parsed.data.percent,
        markupMultiplier: parsed.data.markupMultiplier,
      };
      if (options.id && combos.length === 1) {
        await prisma.marginRule.update({ where: { id: options.id }, data });
      } else if (options.id && !usedOriginal) {
        await prisma.marginRule.update({ where: { id: options.id }, data });
        usedOriginal = true;
      } else await prisma.marginRule.create({ data });
    } else {
      const data = { ...base, discountPercent: parsed.data.percent };
      if (options.id && combos.length === 1) {
        await prisma.discountRule.update({ where: { id: options.id }, data });
      } else if (options.id && !usedOriginal) {
        await prisma.discountRule.update({ where: { id: options.id }, data });
        usedOriginal = true;
      } else await prisma.discountRule.create({ data });
    }
  }

  const exemptionCount = groupId
    ? await syncExemptionRows(kind, groupId, parsed, excludeProductIds, clientNames)
    : 0;
  return combos.length + exemptionCount;
}

async function syncExemptionRows(
  kind: "margin" | "discount",
  groupId: string,
  parsed: Extract<ReturnType<typeof parseRule>, { ok: true }>,
  excludeProductIds: string[],
  clientNames: Map<string, string>
) {
  const existing =
    kind === "margin"
      ? await prisma.marginRule.findMany({ where: { groupId, isExemption: true } })
      : await prisma.discountRule.findMany({ where: { groupId, isExemption: true } });

  if (parsed.data.target === "PRODUCT" || excludeProductIds.length === 0) {
    for (const row of existing) {
      if (kind === "margin") await prisma.marginRule.delete({ where: { id: row.id } });
      else await prisma.discountRule.delete({ where: { id: row.id } });
    }
    return 0;
  }

  const clientKeys = [...new Set(parsed.data.combos.map((combo) => combo.clientId))];
  if (clientKeys.length * excludeProductIds.length > 400) {
    throw new Error("TOO_MANY_EXEMPTIONS");
  }

  const productNames = await resourceNameMap("PRODUCT", excludeProductIds);
  const existingByKey = new Map(existing.map((row) => [`${row.clientId || ""}::${row.scopeId || ""}`, row.id]));
  const keep = new Set<string>();

  for (const clientId of clientKeys) {
    for (const productId of excludeProductIds) {
      const productName = productNames.get(productId) || "producto";
      const name = `Excepción · ${productName}`.slice(0, 200);
      const base = {
        name: parsed.data.customName ? `${parsed.data.customName} · no aplica · ${productName}`.slice(0, 200) : name,
        priority: autoPriority("PRODUCT", Boolean(clientId)),
        scopeType: "PRODUCT" as const,
        scopeId: productId,
        clientId,
        productId,
        isActive: parsed.data.isActive,
        groupId,
        isExemption: true,
      };
      const key = `${clientId || ""}::${productId}`;
      const existingId = existingByKey.get(key);
      if (kind === "margin") {
        const data = { ...base, marginPercent: parsed.data.percent, markupMultiplier: parsed.data.markupMultiplier };
        if (existingId) await prisma.marginRule.update({ where: { id: existingId }, data });
        else await prisma.marginRule.create({ data });
      } else {
        const data = { ...base, discountPercent: parsed.data.percent };
        if (existingId) await prisma.discountRule.update({ where: { id: existingId }, data });
        else await prisma.discountRule.create({ data });
      }
      keep.add(key);
    }
  }

  for (const row of existing) {
    const key = `${row.clientId || ""}::${row.scopeId || ""}`;
    if (keep.has(key)) continue;
    if (kind === "margin") await prisma.marginRule.delete({ where: { id: row.id } });
    else await prisma.discountRule.delete({ where: { id: row.id } });
  }

  return keep.size;
}

function rethrowIfRedirect(err: unknown) {
  const digest = err && typeof err === "object" && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  if (digest.includes("NEXT_REDIRECT") || digest.includes("NEXT_NOT_FOUND")) throw err;
}

export async function upsertMarginRule(formData: FormData): Promise<{ ok: boolean; error?: string; count?: number }> {
  await requireAdmin();
  const parsed = parseRule(formData, "margin");
  if (!parsed.ok) return parsed;
  try {
    const count = await saveRuleRows("margin", parsed, {
      id: formData.get("id")?.toString() || undefined,
      groupId: formData.get("groupId")?.toString() || undefined,
      replaceGroup: formData.get("replaceGroup") === "on",
      excludeProductIds: formIds(formData, "excludeProductIds", "excludeProductId"),
    });
    try {
      revalidatePricing();
    } catch (revalidateErr) {
      rethrowIfRedirect(revalidateErr);
      console.error("revalidatePricing", revalidateErr);
    }
    return { ok: true, count };
  } catch (err) {
    rethrowIfRedirect(err);
    console.error("upsertMarginRule", err);
    return { ok: false, error: saveRuleError(err) };
  }
}

export async function deleteMarginRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.marginRule.delete({ where: { id } });
  revalidatePricing();
}

export async function deleteMarginRuleGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const groupId = String(formData.get("groupId") || "");
  if (!groupId) return;
  await prisma.marginRule.deleteMany({ where: { groupId } });
  revalidatePricing();
}

export async function upsertDiscountRule(formData: FormData): Promise<{ ok: boolean; error?: string; count?: number }> {
  await requireAdmin();
  const parsed = parseRule(formData, "discount");
  if (!parsed.ok) return parsed;
  try {
    const count = await saveRuleRows("discount", parsed, {
      id: formData.get("id")?.toString() || undefined,
      groupId: formData.get("groupId")?.toString() || undefined,
      replaceGroup: formData.get("replaceGroup") === "on",
      excludeProductIds: formIds(formData, "excludeProductIds", "excludeProductId"),
    });
    try {
      revalidatePricing();
    } catch (revalidateErr) {
      rethrowIfRedirect(revalidateErr);
      console.error("revalidatePricing", revalidateErr);
    }
    return { ok: true, count };
  } catch (err) {
    rethrowIfRedirect(err);
    console.error("upsertDiscountRule", err);
    return { ok: false, error: saveRuleError(err) };
  }
}

export async function deleteDiscountRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.discountRule.delete({ where: { id } });
  revalidatePricing();
}

export async function deleteDiscountRuleGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const groupId = String(formData.get("groupId") || "");
  if (!groupId) return;
  await prisma.discountRule.deleteMany({ where: { groupId } });
  revalidatePricing();
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
  await requireAdmin();
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
          ? { categoryId: { in: scopeIds } }
          : target === "DISTRIBUTOR"
            ? { distributorId: { in: scopeIds } }
            : target === "PRODUCT"
              ? { id: { in: scopeIds } }
              : {};

  const searchWhere = q
    ? {
        OR: [
          { normalizedName: { contains: q, mode: "insensitive" as const } },
          { originalName: { contains: q, mode: "insensitive" as const } },
          { internalSku: { contains: q, mode: "insensitive" as const } },
          { supplierSku: { contains: q, mode: "insensitive" as const } },
          { searchKey: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

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
  await requireAdmin();
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

export async function clearAllProductDiscounts(): Promise<{ ok: boolean; count: number }> {
  await requireAdmin();
  const result = await prisma.product.updateMany({
    where: { discountPercent: { gt: 0 } },
    data: { discountPercent: null },
  });
  revalidatePricing();
  return { ok: true, count: result.count };
}

export async function clearManufacturerPromo(formData: FormData): Promise<void> {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.visibilityRule.delete({ where: { id } });
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/portal/products");
}
