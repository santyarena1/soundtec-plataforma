import { prisma } from "@/lib/prisma";
import { getCatalogProductsByIds, type CatalogContext, type CatalogProduct } from "@/lib/catalog";
import { buildSpecTable, type SpecTable } from "@/lib/compare/spec-table";
import { documentKind } from "@/lib/document-kind";
import { productSubtitle, productTitle } from "@/lib/product-display";
import { commercialTagFor } from "@/lib/commercial-tags";
import type { CompareColumnView } from "@/components/compare/compare-view";

export interface CompareDoc {
  name: string;
  url: string;
  kind: string | null;
}

export interface CompareColumn {
  product: CatalogProduct;
  title: string;
  docs: CompareDoc[];
}

export interface CompareData {
  columns: CompareColumn[];
  specs: SpecTable;
}

type RawDoc = { name?: unknown; nameEs?: unknown; description?: unknown; url?: unknown; fileUrl?: unknown; filePath?: unknown; type?: unknown; documentType?: unknown; fileTypeString?: unknown };

function readDocs(documents: unknown): CompareDoc[] {
  if (!Array.isArray(documents)) return [];
  const out: CompareDoc[] = [];
  for (const raw of documents as RawDoc[]) {
    if (!raw || typeof raw !== "object") continue;
    const url = String(raw.fileUrl || raw.url || raw.filePath || "").trim();
    // Solo links reales (http/https): nada de javascript: ni rutas sueltas.
    if (!/^https?:\/\//i.test(url)) continue;
    const name = String(raw.nameEs || raw.name || raw.description || "Documento").trim();
    const kind = documentKind({ type: String(raw.documentType || raw.type || raw.fileTypeString || ""), url });
    out.push({ name, url, kind: kind.label || null });
  }
  return out;
}

/**
 * Lo que se muestra en la comparación: los productos que este usuario puede ver
 * (los demás ids se ignoran sin avisar qué existen), con su precio según quién
 * mira, sus documentos y la tabla de especificaciones alineada.
 */
export async function loadCompareData(ids: string[], ctx: CatalogContext): Promise<CompareData> {
  const products = await getCatalogProductsByIds(ids, ctx);
  const rich = products.length
    ? await prisma.product.findMany({
        where: { id: { in: products.map((p) => p.id) } },
        select: { id: true, specifications: true, documents: true, widthCm: true, heightCm: true, depthCm: true, weight: true },
      })
    : [];
  const byId = new Map(rich.map((r) => [r.id, r]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  const columns = products.map((product) => ({
    product,
    title: productTitle(product),
    docs: readDocs(byId.get(product.id)?.documents),
  }));
  const specs = buildSpecTable(
    products.map((p) => {
      const r = byId.get(p.id);
      return {
        specifications: r?.specifications ?? null,
        widthCm: num(r?.widthCm),
        heightCm: num(r?.heightCm),
        depthCm: num(r?.depthCm),
        weightKg: num(r?.weight),
      };
    })
  );
  return { columns, specs };
}

/** Columna para la vista (cliente): solo precio final/regular, nunca costos ni reglas. */
export function toCompareColumnView(column: CompareColumn, basePath: string): CompareColumnView {
  const p = column.product;
  const onRequest = p.requiresQuote || !p.pricing || p.pricing.finalPriceUsd <= 0;
  return {
    id: p.id,
    href: `${basePath}/${p.id}`,
    title: column.title,
    description: productSubtitle(p),
    brand: p.brandName,
    category: p.categoryName,
    series: p.seriesName,
    kind: p.kind,
    image: p.primaryImage,
    tag: commercialTagFor({ commercialTag: p.commercialTag, discountPercent: p.pricing?.discountPercent ?? null, priceOnRequest: onRequest }),
    labels: p.labels,
    price: p.pricing
      ? {
          onRequest,
          finalUsd: p.pricing.finalPriceUsd,
          regularUsd: p.pricing.priceBeforeDiscountUsd ?? null,
          discountPercent: p.pricing.discountPercent,
        }
      : null,
    docs: column.docs,
  };
}
