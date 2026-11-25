/**
 * Guardar reglas de margen/descuento (con grupos y excepciones) sobre una base
 * dada. Se usa dentro de una transacción: la revisión de cambios de precio la
 * corre para simular (y deshace) y para aplicar.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { RuleScopeType } from "@prisma/client";
import { z } from "zod";
import { tangoPathLabel } from "@/lib/tango-tree";
import {
  autoPriority,
  autoRuleName,
  markupToMarginPercent,
  resolveRuleScope,
  type RuleTarget,
} from "@/lib/pricing-scope";

export type Db = PrismaClient | Prisma.TransactionClient;

const ruleSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  audience: z.enum(["all", "client"]).optional(),
  target: z.enum(["ALL", "BRAND", "PRODUCT", "CATEGORY", "LINE", "FAMILY", "DISTRIBUTOR"]).optional(),
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

export type ParsedRule = Extract<ReturnType<typeof parseRule>, { ok: true }>;

export function parseRule(formData: FormData, kind: "margin" | "discount") {
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

async function resourceNameMap(db: Db, target: RuleTarget, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const select = { id: true, name: true };
  const rows =
    target === "BRAND"
      ? await db.brand.findMany({ where: { id: { in: ids } }, select })
      : target === "DISTRIBUTOR"
        ? await db.distributor.findMany({ where: { id: { in: ids } }, select })
        : target === "CATEGORY"
          ? (await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, tangoPath: true } })).map(
              (row) => ({ id: row.id, name: row.tangoPath ? tangoPathLabel(row.tangoPath) : row.name })
            )
          : target === "LINE"
            ? await lineNames(db, ids)
          : target === "FAMILY"
            ? await db.productFamily.findMany({ where: { id: { in: ids } }, select })
            : target === "PRODUCT"
              ? (await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, normalizedName: true } })).map(
                  (row) => ({ id: row.id, name: row.normalizedName })
                )
              : [];
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Nombres de series (ProductLine) con la marca: «Sonance · Landscape». */
async function lineNames(db: Db, ids: string[]): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.productLine.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, brand: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, name: `${r.brand.name} · ${r.name}` }));
}

/** «Marca SONANCE», «Sonido › Bafles pasivos», «2 marcas: …»: para títulos de la revisión de precios. */
export async function describeRuleScope(db: Db, target: RuleTarget, ids: string[]): Promise<string> {
  if (target === "ALL" || !ids.length) return "todo el catálogo";
  const names = await resourceNameMap(db, target, ids);
  const list = ids.map((id) => names.get(id) ?? "?");
  const shown = list.slice(0, 3).join(", ");
  return list.length > 3 ? `${shown} y ${list.length - 3} más` : shown;
}

type RuleRowLike = {
  id: string;
  name: string;
  clientId: string | null;
  scopeId: string | null;
  marginPercent?: unknown;
  markupMultiplier?: unknown;
  discountPercent?: unknown;
};

/** ¿El nombre de la subregla lo puso alguien, o es el automático de sus valores de antes? */
export function hasCustomName(
  row: RuleRowLike,
  parsed: Pick<ParsedRule, "data">,
  clientNames: Map<string, string>,
  resources: Map<string, string>
): boolean {
  const markup = row.markupMultiplier != null ? Number(row.markupMultiplier) : 0;
  const kind = parsed.data.kind;
  const mode = kind === "margin" && markup > 0 ? "markup" : "margin";
  const value =
    kind === "discount" ? Number(row.discountPercent ?? 0) : mode === "markup" ? markup : Number(row.marginPercent ?? 0);
  const auto = autoRuleName({
    kind,
    mode,
    value,
    audience: row.clientId ? "client" : "all",
    clientName: row.clientId ? clientNames.get(row.clientId) : null,
    target: parsed.data.target,
    resourceName: row.scopeId ? resources.get(row.scopeId) : null,
  });
  return row.name.trim() !== "" && row.name !== auto;
}

function newGroupId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `grp_${uuid.replace(/-/g, "")}`;
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function saveRuleError(err: unknown) {
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

export async function saveRuleRows(
  db: Db,
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
    resourceNameMap(db, parsed.data.target, scopeIds),
    clientIds.length
      ? db.client.findMany({
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
        ? await db.marginRule.findUnique({ where: { id: options.id }, select: { groupId: true } })
        : await db.discountRule.findUnique({ where: { id: options.id }, select: { groupId: true } });
    groupId = current?.groupId || null;
  }
  if (options.replaceGroup) {
    if (!groupId) groupId = newGroupId();
    const existing =
      kind === "margin"
        ? await db.marginRule.findMany({ where: { groupId } })
        : await db.discountRule.findMany({ where: { groupId } });
    const existingRows = new Map(
      existing.filter((row) => !row.isExemption).map((row) => [comboKey(row.clientId, row.scopeId), row as RuleRowLike])
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
      const key = comboKey(resolved.clientId, resolved.scopeId);
      const previous = existingRows.get(key);
      // «Editar todo» abre el nombre vacío: sin nombre nuevo, una subregla con nombre
      // propio lo conserva (antes se pisaba con el automático y se perdía).
      const name =
        parsed.data.customName ||
        (previous && hasCustomName(previous, parsed, clientNames, resources) ? previous.name : generated);
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
      const existingId = previous?.id;
      if (kind === "margin") {
        const data = { ...base, marginPercent: parsed.data.percent, markupMultiplier: parsed.data.markupMultiplier };
        if (existingId) await db.marginRule.update({ where: { id: existingId }, data });
        else await db.marginRule.create({ data });
      } else {
        const data = { ...base, discountPercent: parsed.data.percent };
        if (existingId) await db.discountRule.update({ where: { id: existingId }, data });
        else await db.discountRule.create({ data });
      }
      keep.add(key);
    }
    for (const row of existing) {
      if (row.isExemption) continue;
      if (keep.has(comboKey(row.clientId, row.scopeId))) continue;
      if (kind === "margin") await db.marginRule.delete({ where: { id: row.id } });
      else await db.discountRule.delete({ where: { id: row.id } });
    }
    const exemptionCount = await syncExemptionRows(db, kind, groupId, parsed, excludeProductIds, clientNames);
    return combos.length + exemptionCount;
  }

  if (!groupId && needsGroup) groupId = newGroupId();
  if (!groupId && options.id) {
    const current =
      kind === "margin"
        ? await db.marginRule.findUnique({ where: { id: options.id }, select: { groupId: true } })
        : await db.discountRule.findUnique({ where: { id: options.id }, select: { groupId: true } });
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
        await db.marginRule.update({ where: { id: options.id }, data });
      } else if (options.id && !usedOriginal) {
        await db.marginRule.update({ where: { id: options.id }, data });
        usedOriginal = true;
      } else await db.marginRule.create({ data });
    } else {
      const data = { ...base, discountPercent: parsed.data.percent };
      if (options.id && combos.length === 1) {
        await db.discountRule.update({ where: { id: options.id }, data });
      } else if (options.id && !usedOriginal) {
        await db.discountRule.update({ where: { id: options.id }, data });
        usedOriginal = true;
      } else await db.discountRule.create({ data });
    }
  }

  // Editar UNA subregla (o sumar una al grupo) solo toca las excepciones de sus clientes:
  // antes borraba las de los otros clientes del grupo.
  const exemptionCount = groupId
    ? await syncExemptionRows(db, kind, groupId, parsed, excludeProductIds, clientNames, { onlyOwnClients: true })
    : 0;
  return combos.length + exemptionCount;
}

async function syncExemptionRows(
  db: Db,
  kind: "margin" | "discount",
  groupId: string,
  parsed: Extract<ReturnType<typeof parseRule>, { ok: true }>,
  excludeProductIds: string[],
  clientNames: Map<string, string>,
  options: { onlyOwnClients?: boolean } = {}
) {
  const ownClients = new Set(parsed.data.combos.map((combo) => combo.clientId || ""));
  const all =
    kind === "margin"
      ? await db.marginRule.findMany({ where: { groupId, isExemption: true } })
      : await db.discountRule.findMany({ where: { groupId, isExemption: true } });
  const existing = options.onlyOwnClients ? all.filter((row) => ownClients.has(row.clientId || "")) : all;

  if (parsed.data.target === "PRODUCT" || excludeProductIds.length === 0) {
    for (const row of existing) {
      if (kind === "margin") await db.marginRule.delete({ where: { id: row.id } });
      else await db.discountRule.delete({ where: { id: row.id } });
    }
    return 0;
  }

  const clientKeys = [...new Set(parsed.data.combos.map((combo) => combo.clientId))];
  if (clientKeys.length * excludeProductIds.length > 400) {
    throw new Error("TOO_MANY_EXEMPTIONS");
  }

  const productNames = await resourceNameMap(db, "PRODUCT", excludeProductIds);
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
        if (existingId) await db.marginRule.update({ where: { id: existingId }, data });
        else await db.marginRule.create({ data });
      } else {
        const data = { ...base, discountPercent: parsed.data.percent };
        if (existingId) await db.discountRule.update({ where: { id: existingId }, data });
        else await db.discountRule.create({ data });
      }
      keep.add(key);
    }
  }

  for (const row of existing) {
    const key = `${row.clientId || ""}::${row.scopeId || ""}`;
    if (keep.has(key)) continue;
    if (kind === "margin") await db.marginRule.delete({ where: { id: row.id } });
    else await db.discountRule.delete({ where: { id: row.id } });
  }

  return keep.size;
}

