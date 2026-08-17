import { requireAdmin, canSeePrices } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { TableEmpty } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { Prisma } from "@prisma/client";
import { ProductsCatalogAdmin } from "./catalog-admin";
import { BulkActiveBar } from "./bulk-active-bar";
import { ProductCompatList } from "../crestron-home/product-compat-list";
import { CrestronActionsBar } from "../crestron-home/crestron-actions";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";
import { calculatePricesForProducts } from "@/lib/pricing";

interface SP {
  q?: string;
  brand?: string | string[];
  category?: string | string[];
  family?: string | string[];
  distributor?: string | string[];
  stock?: string | string[];
  active?: string;
  nocat?: string;
  noimg?: string;
  nodesc?: string;
  crestron?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  tab?: string;
}

function multi(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const SORT_MAP: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  updated_desc: { updatedAt: "desc" },
  updated_asc: { updatedAt: "asc" },
  name_asc: { normalizedName: "asc" },
  name_desc: { normalizedName: "desc" },
  cost_asc: { baseCostUsd: "asc" },
  cost_desc: { baseCostUsd: "desc" },
  sku_asc: { internalSku: "asc" },
};

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const showPrices = await canSeePrices();
  const params = await searchParams;
  const tab = params.tab === "crestron" ? "crestron" : "catalog";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = [12, 25, 50, 100, 200].includes(Number(params.pageSize))
    ? Number(params.pageSize)
    : 25;

  const brandIds = multi(params.brand);
  const categoryIds = multi(params.category);
  const familyIds = multi(params.family);
  const distributorIds = multi(params.distributor);
  const stockStatuses = multi(params.stock);
  const activeFilter =
    params.active === "yes" ? true : params.active === "no" ? false : undefined;

  const where: Prisma.ProductWhereInput = {
    ...(brandIds.length ? { brandId: { in: brandIds } } : {}),
    ...(categoryIds.length ? { categoryId: { in: categoryIds } } : {}),
    ...(familyIds.length ? { familyId: { in: familyIds } } : {}),
    ...(distributorIds.length ? { distributorId: { in: distributorIds } } : {}),
    ...(stockStatuses.length ? { stockStatus: { in: stockStatuses as any[] } } : {}),
    ...(activeFilter !== undefined ? { isActive: activeFilter } : {}),
    ...(params.nocat === "1" ? { categoryId: null } : {}),
    ...(params.noimg === "1" ? { images: { none: {} } } : {}),
    ...(params.nodesc === "1" ? { longDescription: null } : {}),
    ...(params.crestron === "1" ? { isCrestronHomeCompatible: true } : {}),
    ...(params.q
      ? {
          // Búsqueda extendida tipo "Google": tokeniza por espacios, exige que
          // TODOS los tokens matcheen en al menos un campo (AND entre tokens,
          // OR entre campos). Buscamos en nombre + SKUs + descripciones +
          // brand/category/family/distributor + identificadores del fabricante.
          AND: params.q
            .split(/\s+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => {
              const c = { contains: t, mode: "insensitive" as const };
              return {
                OR: [
                  { normalizedName: c },
                  { originalName: c },
                  { internalSku: c },
                  { supplierSku: c },
                  { shortDescription: c },
                  { longDescription: c },
                  { tariffPosition: c },
                  { coo: c },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  { modelNumber: c } as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  { manufacturerItem: c } as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  { productLine: c } as any,
                  { brand: { name: c } },
                  { category: { name: c } },
                  { family: { name: c } },
                  { distributor: { name: c } },
                ],
              };
            }),
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    SORT_MAP[params.sort || ""] ?? { normalizedName: "asc" };

  const [products, total, brands, categories, families, distributors, allLabels, crestronProducts, compatibleCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        family: { select: { id: true, name: true } },
        distributor: { select: { id: true, name: true } },
        images: { where: { isPrimary: true }, take: 1 },
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.product.count({ where }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { products: true } } },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.label.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ isCrestronHomeCompatible: "desc" }, { normalizedName: "asc" }],
      select: { id: true, internalSku: true, normalizedName: true, isCrestronHomeCompatible: true },
    }),
    prisma.product.count({ where: { isCrestronHomeCompatible: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prices = await calculatePricesForProducts(
    products.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      productDiscountPercent: p.discountPercent != null ? Number(p.discountPercent) : null,
      tariffDutyPercent: p.tariffDutyPercent != null ? Number(p.tariffDutyPercent) : null,
      coefNac: p.coefNac != null ? Number(p.coefNac) : null,
      coefVta: p.coefVta != null ? Number(p.coefVta) : null,
      coefVtaFob: p.coefVtaFob != null ? Number(p.coefVtaFob) : null,
      ivaPercent: p.ivaPercent != null ? Number(p.ivaPercent) : null,
      impIntPercent: p.impIntPercent != null ? Number(p.impIntPercent) : null,
    })),
    null
  );

  const rows = products.map((p) => {
    const price = prices.get(p.id);
    return {
    id: p.id,
    sku: p.internalSku || "",
    supplierSku: p.supplierSku || "",
    name: p.normalizedName,
    originalName: p.originalName || "",
    primaryImage: p.images[0]?.url || null,
    brand: p.brand?.name || null,
    brandId: p.brandId,
    category: p.category?.name || null,
    categoryId: p.categoryId,
    family: p.family?.name || null,
    familyId: p.familyId,
    distributor: p.distributor?.name || null,
    distributorId: p.distributorId,
    cost: Number(p.baseCostUsd),
    priceUsdFinal: price?.priceUsdFinal ?? 0,
    priceFobUsd: price?.priceFobUsd ?? 0,
    priceNacFinalArs: price?.priceNacFinalArs ?? 0,
    salePriceUsd: p.salePriceUsd != null ? Number(p.salePriceUsd) : null,
    discountPercent: p.discountPercent ? Number(p.discountPercent) : null,
    tariffPosition: p.tariffPosition || null,
    tariffDutyPercent: p.tariffDutyPercent ? Number(p.tariffDutyPercent) : null,
    stockStatus: p.stockStatus,
    stockQuantity: p.stockQuantity,
    isActive: p.isActive,
    isCustomizable: p.isCustomizable,
    kind: p.kind as "PRINCIPAL" | "ACCESORIO",
    shortDescription: p.shortDescription || null,
    longDescription: p.longDescription || null,
    aiGeneratedDescription: p.aiGeneratedDescription,
    isCrestronHomeCompatible: p.isCrestronHomeCompatible,
    updatedAt: p.updatedAt.toISOString(),
    labels: p.labels.map((pl) => pl.label),
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos"
        description={tab === "crestron"
          ? `${compatibleCount} de ${crestronProducts.length} productos compatibles con Crestron Home`
          : `${total} productos · página ${page} de ${totalPages}`}
        actions={
          tab === "crestron" ? (
            <CrestronActionsBar />
          ) : (
            <ButtonLink href="/admin/products/new">
              <Plus className="h-4 w-4" /> Nuevo producto
            </ButtonLink>
          )
        }
      />

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1" data-tour="products-tabs">
        <Link
          href="/admin/products"
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "catalog" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          Catálogo
        </Link>
        <Link
          href="/admin/products?tab=crestron"
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "crestron" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          Crestron Home
        </Link>
      </div>

      {tab === "crestron" ? (
        <Card>
          <CardContent className="p-5">
            <ProductCompatList products={crestronProducts} />
          </CardContent>
        </Card>
      ) : rows.length === 0 &&
      !params.q &&
      brandIds.length === 0 &&
      categoryIds.length === 0 &&
      familyIds.length === 0 &&
      distributorIds.length === 0 &&
      stockStatuses.length === 0 &&
      activeFilter === undefined &&
      !params.nocat &&
      !params.noimg &&
      !params.nodesc &&
      !params.crestron ? (
        <TableEmpty message="Todavía no hay productos. Creá uno o importá un Excel desde Importaciones." />
      ) : tab === "catalog" ? (
        <>
          <BulkActiveBar
            matchingCount={total}
            filters={{ brandIds, categoryIds, familyIds, q: params.q }}
            brands={brands.map((b) => ({ id: b.id, name: b.name, productCount: b._count.products }))}
          />
          <Suspense fallback={null}>
            <ProductsCatalogAdmin
              rows={rows}
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              showPrices={showPrices}
              filters={{
                q: params.q || "",
                brandIds,
                categoryIds,
                familyIds,
                distributorIds,
                stockStatuses,
                active: params.active || "",
                nocat: params.nocat === "1",
                noimg: params.noimg === "1",
                nodesc: params.nodesc === "1",
                crestron: params.crestron === "1",
                sort: params.sort || "updated_desc",
              }}
              brands={brands.map((b) => ({ id: b.id, name: b.name }))}
              categories={categories}
              families={families}
              distributors={distributors}
              allLabels={allLabels}
            />
          </Suspense>
        </>
      ) : null}
    </div>
  );
}
