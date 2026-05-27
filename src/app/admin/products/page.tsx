import { requireAdmin, canSeePrices } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { TableEmpty } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { Prisma } from "@prisma/client";
import { ProductsCatalogAdmin } from "./catalog-admin";
import { Suspense } from "react";

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
  sort?: string;
  page?: string;
  pageSize?: string;
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
    ...(params.q
      ? {
          OR: [
            { normalizedName: { contains: params.q, mode: "insensitive" } },
            { internalSku: { contains: params.q, mode: "insensitive" } },
            { supplierSku: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    SORT_MAP[params.sort || ""] ?? { updatedAt: "desc" };

  const [products, total, brands, categories, families, distributors] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        family: { select: { id: true, name: true } },
        distributor: { select: { id: true, name: true } },
        images: { where: { isPrimary: true }, take: 1 },
      },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.product.count({ where }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = products.map((p) => ({
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
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos"
        description={`${total} productos · página ${page} de ${totalPages}`}
        actions={
          <ButtonLink href="/admin/products/new">
            <Plus className="h-4 w-4" /> Nuevo producto
          </ButtonLink>
        }
      />

      {rows.length === 0 &&
      !params.q &&
      brandIds.length === 0 &&
      categoryIds.length === 0 &&
      familyIds.length === 0 &&
      distributorIds.length === 0 &&
      stockStatuses.length === 0 &&
      activeFilter === undefined &&
      !params.nocat &&
      !params.noimg &&
      !params.nodesc ? (
        <TableEmpty message="Todavía no hay productos. Creá uno o importá un Excel desde Importaciones." />
      ) : (
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
              sort: params.sort || "updated_desc",
            }}
            brands={brands}
            categories={categories}
            families={families}
            distributors={distributors}
          />
        </Suspense>
      )}
    </div>
  );
}
