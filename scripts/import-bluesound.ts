/**
 * Carga la línea Bluesound Professional desde la lista de precios (FOB) enriquecida
 * con bluesoundprofessional.com. Idempotente: si el producto ya existe (misma marca
 * y código) lo actualiza; no duplica.
 *
 *   npx tsx scripts/import-bluesound.ts data/bluesound/productos-2026-10.json          (solo cuenta)
 *   npx tsx scripts/import-bluesound.ts data/bluesound/productos-2026-10.json --apply  (escribe)
 *
 * El costo es el FOB de la lista; los coeficientes de venta se ponen después por regla.
 */
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/utils";
import { isTangoTreeActive } from "../src/lib/tango-tree-db";
import { ensureNode, loadTangoProposals } from "../src/server/category-proposals";

type Item = {
  sku: string;
  listModel: string;
  color: string | null;
  fobUsd: number;
  originalName: string;
  shortDescription: string;
  longDescription: string;
  keyFeatures: string[];
  specifications: Array<{ group?: string; label: string; value: string; labelEs?: string; valueEs?: string }>;
  images: string[];
  documents: Array<{ name: string; url: string; fileType?: string }>;
  vendorProductUrl: string | null;
  coo: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightKg: number | null;
  kind: "PRINCIPAL" | "ACCESORIO";
  accessoryRequiredWithPrimary: boolean;
  accessoryFor: string[];
  line: string | null;
  tangoPath: string;
};

const BRAND = "Bluesound Professional";
const DISTRIBUTOR = "Bluesound Professional (Lenbrook)";
const dec = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : new Prisma.Decimal(n));

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Falta el JSON de productos.");
  const items = JSON.parse(readFileSync(file, "utf8")) as Item[];

  const brand = await prisma.brand.findFirst({ where: { name: { equals: BRAND, mode: "insensitive" } } });
  const existing = brand
    ? await prisma.product.findMany({ where: { brandId: brand.id }, select: { id: true, normalizedName: true } })
    : [];
  const bySku = new Map(existing.map((p) => [p.normalizedName.toUpperCase(), p.id]));
  const toCreate = items.filter((i) => !bySku.has(i.sku.toUpperCase()));
  console.log(`Productos: ${items.length} · nuevos ${toCreate.length} · a actualizar ${items.length - toCreate.length} · marca ${brand ? "existe" : "se crea"}`);
  if (!apply) return;

  // El rubro sale del árbol de Tango: si no está cargado, se carga (sin mover productos).
  if (!(await isTangoTreeActive(prisma))) await loadTangoProposals();

  const brandId =
    brand?.id ?? (await prisma.brand.create({ data: { name: BRAND, slug: slugify(BRAND) }, select: { id: true } })).id;
  const distributor =
    (await prisma.distributor.findFirst({ where: { name: DISTRIBUTOR }, select: { id: true } })) ??
    (await prisma.distributor.create({ data: { name: DISTRIBUTOR, slug: slugify(DISTRIBUTOR) }, select: { id: true } }));

  const idBySku = new Map<string, string>();
  const now = new Date();
  for (const item of items) {
    const categoryId = item.tangoPath ? await ensureNode(item.tangoPath) : null;
    const data = {
      normalizedName: item.sku,
      originalName: item.originalName,
      supplierSku: item.sku,
      modelNumber: item.listModel,
      brandId,
      distributorId: distributor.id,
      categoryId,
      line: item.line,
      kind: item.kind,
      accessoryRequiredWithPrimary: item.accessoryRequiredWithPrimary,
      shortDescription: item.shortDescription,
      longDescription: item.longDescription,
      keyFeatures: item.keyFeatures as Prisma.InputJsonValue,
      specifications: item.specifications as unknown as Prisma.InputJsonValue,
      documents: item.documents.map((d) => ({ name: d.name, url: d.url, type: d.fileType ?? "pdf", fileType: d.fileType ?? "pdf" })) as Prisma.InputJsonValue,
      vendorProductUrl: item.vendorProductUrl,
      coo: item.coo,
      widthCm: dec(item.widthCm),
      heightCm: dec(item.heightCm),
      depthCm: dec(item.depthCm),
      weight: dec(item.weightKg),
      baseCostUsd: new Prisma.Decimal(item.fobUsd),
      currency: "USD",
      isActive: true,
      enrichedAt: now,
      translatedAt: now,
    };
    const id = bySku.get(item.sku.toUpperCase());
    const product = id
      ? await prisma.product.update({ where: { id }, data, select: { id: true } })
      : await prisma.product.create({ data, select: { id: true } });
    idBySku.set(item.sku.toUpperCase(), product.id);

    // Fotos: se reemplazan las que vinieron del fabricante; las subidas a mano no se tocan.
    await prisma.productImage.deleteMany({ where: { productId: product.id, source: "supplier" } });
    if (item.images.length) {
      const hasPrimary = (await prisma.productImage.count({ where: { productId: product.id, isPrimary: true } })) > 0;
      await prisma.productImage.createMany({
        data: item.images.map((url, i) => ({ productId: product.id, url, alt: `${item.sku}${i ? ` - ${i + 1}` : ""}`, source: "supplier", isPrimary: !hasPrimary && i === 0 })),
      });
    }
  }

  // Accesorio → equipos con los que va.
  let relations = 0;
  for (const item of items) {
    const accessoryId = idBySku.get(item.sku.toUpperCase())!;
    for (const target of item.accessoryFor) {
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
  console.log(`Listo: ${idBySku.size} productos de ${BRAND} · ${relations} relaciones accesorio → equipo · proveedor «${DISTRIBUTOR}».`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
