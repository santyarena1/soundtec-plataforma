/**
 * Carga productos de un fabricante desde un JSON ya enriquecido (fichas en
 * castellano, especificaciones, fotos, documentos y rubro de Tango). Idempotente:
 * si el producto ya existe (misma marca y modelo) lo actualiza; no duplica.
 *
 *   npx tsx scripts/import-manufacturer-json.ts <archivo.json> --brand "SONANCE" [opciones]          (solo cuenta)
 *   npx tsx scripts/import-manufacturer-json.ts <archivo.json> --brand "SONANCE" [opciones] --apply  (escribe)
 *
 * Opciones:
 *   --distributor "Nombre"   proveedor (se crea si no existe)
 *   --commercial-tag A_PEDIDO cartel para el cliente (ver lib/commercial-tags)
 *   --stock ON_REQUEST        disponibilidad (IN_STOCK, LOW_STOCK, OUT_OF_STOCK, ON_REQUEST, UNKNOWN)
 *
 * Productos nuevos: sin precio (fobUsd null o ausente) quedan con «Consultá precio».
 * Productos existentes: solo se pisa lo que trae el JSON. Sin fobUsd no se toca
 * el precio; sin images no se tocan las fotos; nombre, códigos, marca y si está
 * activo quedan como estaban.
 */
import { readFileSync } from "node:fs";
import { Prisma, type StockStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/utils";
import { isTangoTreeActive } from "../src/lib/tango-tree-db";
import { isCommercialTag } from "../src/lib/commercial-tags";
import { ensureNode, loadTangoProposals } from "../src/server/category-proposals";

type Item = {
  sku: string;
  supplierSku?: string | null;
  listModel?: string | null;
  fobUsd?: number | null;
  originalName: string;
  shortDescription: string;
  longDescription: string;
  keyFeatures: string[];
  specifications: Array<{ group?: string; label: string; value: string; labelEs?: string; valueEs?: string }>;
  images?: string[];
  documents?: Array<{ name: string; url: string; fileType?: string }>;
  vendorProductUrl?: string | null;
  coo?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  weightKg?: number | null;
  kind?: "PRINCIPAL" | "ACCESORIO";
  accessoryRequiredWithPrimary?: boolean;
  accessoryFor?: string[];
  /** Diagramas y gráficos del fabricante: van a la galería después de las fotos. */
  graphics?: string[];
  /** Productos que el fabricante relaciona (por modelo, de cualquier marca del catálogo). */
  relations?: Array<{ kind: "ACCESSORY" | "MODEL_VARIANT" | "RELATED" | "COMPATIBLE"; sku: string }>;
  line?: string | null;
  tangoPath?: string | null;
};

const GRAPHIC_SOURCE = "manufacturer-diagram";
const STOCK: StockStatus[] = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"];
const dec = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : new Prisma.Decimal(n));

function flag(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  const brandName = flag("--brand");
  const distributorName = flag("--distributor");
  const tag = flag("--commercial-tag");
  const stock = flag("--stock");
  if (!file || !brandName) throw new Error("Uso: <archivo.json> --brand <marca> [--distributor <nombre>] [--commercial-tag <clave>] [--stock <estado>] [--apply]");
  if (tag && !isCommercialTag(tag)) throw new Error(`Cartel desconocido: ${tag}`);
  if (stock && !STOCK.includes(stock as StockStatus)) throw new Error(`Disponibilidad desconocida: ${stock}`);
  const items = JSON.parse(readFileSync(file, "utf8")) as Item[];

  const brand = await prisma.brand.findFirst({ where: { name: { equals: brandName, mode: "insensitive" } } });
  const existing = brand ? await prisma.product.findMany({ where: { brandId: brand.id }, select: { id: true, normalizedName: true } }) : [];
  const bySku = new Map(existing.map((p) => [p.normalizedName.toUpperCase(), p.id]));
  const toCreate = items.filter((i) => !bySku.has(i.sku.toUpperCase()));
  console.log(`Productos: ${items.length} · nuevos ${toCreate.length} · a actualizar ${items.length - toCreate.length} · marca ${brand ? brand.name : "se crea"}`);
  if (!apply) return;

  if (!(await isTangoTreeActive(prisma))) await loadTangoProposals();
  const brandId = brand?.id ?? (await prisma.brand.create({ data: { name: brandName, slug: slugify(brandName) }, select: { id: true } })).id;
  const distributorId = distributorName
    ? (
        (await prisma.distributor.findFirst({ where: { name: distributorName }, select: { id: true } })) ??
        (await prisma.distributor.create({ data: { name: distributorName, slug: slugify(distributorName) }, select: { id: true } }))
      ).id
    : undefined;

  const idBySku = new Map<string, string>();
  const now = new Date();
  for (const item of items) {
    const id = bySku.get(item.sku.toUpperCase());
    // Contenido de la ficha: se escribe siempre lo que trae el JSON.
    const content = {
      ...(item.tangoPath ? { categoryId: await ensureNode(item.tangoPath) } : {}),
      ...(item.line !== undefined ? { line: item.line } : {}),
      ...(item.kind ? { kind: item.kind } : {}),
      ...(item.accessoryRequiredWithPrimary !== undefined ? { accessoryRequiredWithPrimary: item.accessoryRequiredWithPrimary } : {}),
      shortDescription: item.shortDescription,
      longDescription: item.longDescription,
      keyFeatures: item.keyFeatures as Prisma.InputJsonValue,
      specifications: item.specifications as unknown as Prisma.InputJsonValue,
      ...(item.documents
        ? { documents: item.documents.map((d) => ({ name: d.name, url: d.url, type: d.fileType ?? "pdf", fileType: d.fileType ?? "pdf" })) as Prisma.InputJsonValue }
        : {}),
      ...(item.vendorProductUrl !== undefined ? { vendorProductUrl: item.vendorProductUrl } : {}),
      ...(item.coo !== undefined ? { coo: item.coo } : {}),
      ...(item.widthCm !== undefined ? { widthCm: dec(item.widthCm) } : {}),
      ...(item.heightCm !== undefined ? { heightCm: dec(item.heightCm) } : {}),
      ...(item.depthCm !== undefined ? { depthCm: dec(item.depthCm) } : {}),
      ...(item.weightKg !== undefined ? { weight: dec(item.weightKg) } : {}),
      ...(item.fobUsd !== undefined ? { baseCostUsd: new Prisma.Decimal(item.fobUsd ?? 0), requiresQuote: item.fobUsd == null } : {}),
      enrichedAt: now,
      translatedAt: now,
      ...(tag ? { commercialTag: tag } : {}),
      ...(stock ? { stockStatus: stock as StockStatus } : {}),
    };
    const product = id
      ? await prisma.product.update({ where: { id }, data: content, select: { id: true } })
      : await prisma.product.create({
          data: {
            ...content,
            normalizedName: item.sku,
            originalName: item.originalName,
            supplierSku: item.supplierSku ?? item.sku,
            modelNumber: item.listModel ?? item.sku,
            brandId,
            ...(distributorId ? { distributorId } : {}),
            kind: item.kind ?? "PRINCIPAL",
            baseCostUsd: new Prisma.Decimal(item.fobUsd ?? 0),
            requiresQuote: item.fobUsd == null,
            currency: "USD",
            isActive: true,
          },
          select: { id: true },
        });
    idBySku.set(item.sku.toUpperCase(), product.id);

    // Fotos (solo si el JSON las trae): se reemplazan las del fabricante; las subidas a mano no se tocan.
    if (item.images?.length) {
      await prisma.productImage.deleteMany({ where: { productId: product.id, source: "supplier" } });
      const hasPrimary = (await prisma.productImage.count({ where: { productId: product.id, isPrimary: true } })) > 0;
      await prisma.productImage.createMany({
        data: item.images.map((url, i) => ({ productId: product.id, url, alt: `${item.sku}${i ? ` - ${i + 1}` : ""}`, source: "supplier", isPrimary: !hasPrimary && i === 0 })),
      });
    }
    // Diagramas y gráficos: se reemplazan los anteriores del mismo origen; nunca son la foto principal.
    if (item.graphics) {
      await prisma.productImage.deleteMany({ where: { productId: product.id, source: GRAPHIC_SOURCE } });
      if (item.graphics.length) {
        await prisma.productImage.createMany({
          data: item.graphics.map((url, i) => ({ productId: product.id, url, alt: `${item.sku} - diagrama ${i + 1}`, source: GRAPHIC_SOURCE, isPrimary: false })),
        });
      }
    }
  }

  let relations = 0;
  for (const item of items) {
    const accessoryId = idBySku.get(item.sku.toUpperCase())!;
    for (const target of item.accessoryFor ?? []) {
      const productId = idBySku.get(target.toUpperCase());
      if (!productId) continue;
      await prisma.accessoryRelation.upsert({
        where: { productId_accessoryProductId_kind: { productId, accessoryProductId: accessoryId, kind: "ACCESSORY" } },
        create: { productId, accessoryProductId: accessoryId, kind: "ACCESSORY", isRequired: false },
        update: {},
      });
      relations += 1;
    }
  }
  // Relacionados del fabricante: el modelo se busca en todo el catálogo (activo).
  const wanted = [...new Set(items.flatMap((i) => (i.relations ?? []).map((r) => r.sku.toUpperCase())))];
  const targets = wanted.length
    ? await prisma.product.findMany({ where: { isActive: true, normalizedName: { in: wanted, mode: "insensitive" } }, select: { id: true, normalizedName: true } })
    : [];
  const targetBySku = new Map(targets.map((t) => [t.normalizedName.toUpperCase(), t.id]));
  let linked = 0;
  const notFound = new Set<string>();
  for (const item of items) {
    const productId = idBySku.get(item.sku.toUpperCase())!;
    for (const rel of item.relations ?? []) {
      const otherId = targetBySku.get(rel.sku.toUpperCase());
      if (!otherId) { notFound.add(rel.sku); continue; }
      if (otherId === productId) continue;
      await prisma.accessoryRelation.upsert({
        where: { productId_accessoryProductId_kind: { productId, accessoryProductId: otherId, kind: rel.kind } },
        create: { productId, accessoryProductId: otherId, kind: rel.kind, isRequired: false },
        update: {},
      });
      linked += 1;
    }
  }
  if (linked || notFound.size) console.log(`Relacionados: ${linked} vinculados · ${notFound.size} modelos que no están en el catálogo`);
  console.log(`Listo: ${idBySku.size} productos de ${brandName}${relations ? ` · ${relations} relaciones accesorio → equipo` : ""}${tag ? ` · cartel ${tag}` : ""}${stock ? ` · ${stock}` : ""}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
