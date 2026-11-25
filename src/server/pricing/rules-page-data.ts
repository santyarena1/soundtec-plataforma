/**
 * Datos de las pantallas Precios › Márgenes y Precios › Descuentos (las dos
 * usan el mismo espacio de reglas). Todo en una sola tanda de consultas en
 * paralelo: antes los rubros, las series y el cartel de revisiones se pedían
 * después, uno detrás del otro.
 */
import { prisma } from "@/lib/prisma";
import { categoryLabelMap, lineOptions } from "@/lib/category-tree";
import { attachRuleExemptions, toFiniteNumber, toPricingRuleRow } from "@/lib/pricing-scope";
import { pendingRuleReviews, type PendingRuleReviews } from "@/lib/price-review/pending";
import type { RuleKind } from "@/lib/price-review/operations";
import type { PricingRuleRow } from "@/components/admin/pricing-rules-table";

type Named = { id: string; name: string };

export interface RulesPageData {
  rows: PricingRuleRow[];
  clients: Array<{ id: string; name: string; companyName: string | null }>;
  brands: Named[];
  distributors: Named[];
  families: Named[];
  lines: Named[];
  /**
   * Solo los productos que usan las reglas (para los nombres al editar). La lista
   * completa para elegir la pide el formulario cuando se elige «Producto(s)».
   */
  products: Array<{ id: string; normalizedName: string }>;
  pending: PendingRuleReviews;
  pendingCounts: { own: number; all: number };
  /** Cuándo se leyó (lo usa la pantalla para refrescar si vuelve con «atrás» a una copia vieja). */
  renderedAt: number;
}

const AREA: Record<RuleKind, "MARGIN" | "DISCOUNT"> = { margin: "MARGIN", discount: "DISCOUNT" };

type RawRule = {
  id: string;
  name: string;
  scopeType: string;
  scopeId: string | null;
  clientId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  groupId: string | null;
  isExemption: boolean;
  marginPercent?: unknown;
  markupMultiplier?: unknown;
  discountPercent?: unknown;
};

function loadRules(kind: RuleKind): Promise<RawRule[]> {
  const orderBy = [{ priority: "asc" as const }, { createdAt: "desc" as const }];
  return kind === "margin" ? prisma.marginRule.findMany({ orderBy }) : prisma.discountRule.findMany({ orderBy });
}

/**
 * Listas para los selectores y los nombres de la tabla (clientes, marcas, rutas
 * de rubros, series…): cambian poco y lo más pesado son los ~2.000 rubros. Se
 * guardan 30 s en memoria del servidor; las reglas y las revisiones pendientes se
 * leen siempre frescas. El árbol de rubros para elegir no viaja con la pantalla:
 * lo pide el formulario al elegir «Rubro(s)» (y la pestaña «Por producto»).
 */
const REFERENCE_TTL_MS = 30_000;
type ReferenceData = Awaited<ReturnType<typeof readReferenceData>>;
let referenceCache: { at: number; value: Promise<ReferenceData> } | null = null;

async function readReferenceData() {
  const [clients, brands, distributors, families, lines, categoryLabels] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, contactName: true },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    lineOptions(),
    categoryLabelMap(),
  ]);
  return { clients, brands, distributors, families, lines, categoryLabels };
}

function loadReferenceData(): Promise<ReferenceData> {
  if (referenceCache && Date.now() - referenceCache.at < REFERENCE_TTL_MS) return referenceCache.value;
  const value = readReferenceData();
  referenceCache = { at: Date.now(), value };
  // Si falla, no queda guardado el error: el próximo pedido vuelve a leer.
  value.catch(() => {
    if (referenceCache?.value === value) referenceCache = null;
  });
  return value;
}

export async function loadRulesPageData(kind: RuleKind): Promise<RulesPageData> {
  const area = AREA[kind];
  const productSelect = { id: true, normalizedName: true } as const;
  const [rules, reference, ruleProducts, pendingReviews, allPending] = await Promise.all([
    loadRules(kind),
    loadReferenceData(),
    // Los productos de las reglas «Producto», en la misma tanda (por la relación de la regla).
    prisma.product.findMany({
      where: kind === "margin" ? { marginRules: { some: {} } } : { discountRules: { some: {} } },
      orderBy: { normalizedName: "asc" },
      select: productSelect,
    }),
    prisma.priceReview
      .findMany({
        where: { status: "PENDING", area },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, createdAt: true, operation: true },
      })
      .catch(() => []),
    prisma.priceReview.count({ where: { status: "PENDING" } }).catch(() => 0),
  ]);

  const { clients, brands, distributors, families, lines, categoryLabels } = reference;
  const productNames = new Map(ruleProducts.map((p) => [p.id, p.normalizedName]));
  // Reglas viejas con el producto solo en scopeId (sin la relación): se completan aparte.
  const missing = [...new Set(rules.filter((r) => r.scopeType === "PRODUCT" && r.scopeId && !productNames.has(r.scopeId)).map((r) => r.scopeId as string))];
  const products = missing.length
    ? [...ruleProducts, ...(await prisma.product.findMany({ where: { id: { in: missing } }, select: productSelect }))]
    : ruleProducts;
  for (const p of products) productNames.set(p.id, p.normalizedName);

  const clientMap = new Map(clients.map((c) => [c.id, c.companyName || c.contactName || c.id]));
  const resourceMaps: Record<string, Map<string, string>> = {
    BRAND: new Map(brands.map((b) => [b.id, b.name])),
    DISTRIBUTOR: new Map(distributors.map((d) => [d.id, d.name])),
    CATEGORY: categoryLabels,
    LINE: new Map(lines.map((l) => [l.id, l.name])),
    FAMILY: new Map(families.map((f) => [f.id, f.name])),
    PRODUCT: productNames,
  };

  const rows = attachRuleExemptions(
    rules.map((r) =>
      toPricingRuleRow({
        id: r.id,
        name: r.name,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        clientId: r.clientId,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        percent: toFiniteNumber(kind === "margin" ? r.marginPercent : r.discountPercent),
        markupMultiplier: kind === "margin" && r.markupMultiplier != null ? toFiniteNumber(r.markupMultiplier) : null,
        groupId: r.groupId,
        isExemption: r.isExemption,
        clientName: r.clientId ? clientMap.get(r.clientId) ?? null : null,
        resourceName: r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) ?? null : null,
      })
    )
  );

  return {
    rows,
    clients: clients.map((c) => ({ id: c.id, name: c.contactName || c.companyName, companyName: c.companyName })),
    brands,
    distributors,
    families,
    lines,
    products,
    pending: pendingRuleReviews(kind, pendingReviews),
    pendingCounts: { own: pendingReviews.length, all: allPending },
    renderedAt: Date.now(),
  };
}
