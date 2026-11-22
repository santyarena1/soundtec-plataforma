import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { listCategoryTree } from "@/lib/category-tree";
import { tangoPathLabel } from "@/lib/tango-tree";
import { applyPendingBranches, loadTangoProposals, TANGO_BATCH } from "@/server/category-proposals";
import { ProposalsBoard, type ProposalRow, type NewBranch } from "./proposals-board";
import { UncategorizedTray, type UncategorizedRow } from "./uncategorized-tray";
import { countUncategorizedProducts, uncategorizedProductWhere, UNCATEGORIZED_BATCH } from "@/server/uncategorized";
import { productCoverImageInclude } from "@/lib/product-cover-image";
import { RubrosTabs } from "@/app/admin/categories/rubros-tabs";

export const metadata = { title: "Admin · Reclasificación de rubros" };
export const maxDuration = 300;

const PAGE_SIZE = 50;
type Search = { ver?: string; marca?: string; q?: string; pagina?: string };

export default async function ReclassificationPage({ searchParams }: { searchParams: Search }) {
  await requireStaff("categories.manage");
  // La primera vez se carga solo: el árbol de Tango, las propuestas y los rubros nuevos. No mueve productos.
  if ((await prisma.categoryProposal.count({ where: { batch: TANGO_BATCH } })) === 0) await loadTangoProposals();
  else if (await prisma.tangoBranchSuggestion.count({ where: { batch: TANGO_BATCH, status: "PENDING" } })) await applyPendingBranches();

  const marca = searchParams.marca ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.pagina) || 1);
  if (searchParams.ver === "uno-a-uno") return <UncategorizedPage marca={marca} q={q} page={page} />;
  const ver = searchParams.ver === "seguros" || searchParams.ver === "decididos" ? searchParams.ver : "revisar";

  const where: Prisma.CategoryProposalWhereInput = {
    batch: TANGO_BATCH,
    ...(ver === "revisar" ? { status: "PENDING", confidence: { not: "alta" } } : ver === "seguros" ? { status: "PENDING", confidence: "alta" } : { status: { not: "PENDING" } }),
    ...(marca || q
      ? {
          product: {
            ...(marca ? { brand: { name: marca } } : {}),
            ...(q ? { OR: [{ normalizedName: { contains: q, mode: "insensitive" } }, { internalSku: { contains: q } }] } : {}),
          },
        }
      : {}),
  };

  const [counts, rows, matching, brands, nodes, branches, uncategorizedCount] = await Promise.all([
    prisma.categoryProposal.groupBy({ by: ["status", "confidence"], where: { batch: TANGO_BATCH }, _count: { _all: true } }),
    prisma.categoryProposal.findMany({
      where,
      orderBy: ver === "decididos" ? [{ decidedAt: "desc" }] : [{ product: { brand: { name: "asc" } } }, { product: { normalizedName: "asc" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { product: { select: { id: true, normalizedName: true, internalSku: true, shortDescription: true, brand: { select: { name: true } }, category: { select: { name: true, tangoPath: true } } } } },
    }),
    prisma.categoryProposal.count({ where }),
    prisma.brand.findMany({ where: { products: { some: { categoryProposals: { some: { batch: TANGO_BATCH } } } } }, orderBy: { name: "asc" }, select: { name: true } }),
    listCategoryTree(),
    prisma.tangoBranchSuggestion.findMany({ where: { batch: TANGO_BATCH, status: "APPROVED" }, orderBy: { tangoPath: "asc" } }),
    countUncategorizedProducts(),
  ]);
  const branchCounts = await prisma.categoryProposal.groupBy({ by: ["tangoPath"], where: { batch: TANGO_BATCH, tangoPath: { in: branches.map((b) => b.tangoPath) } }, _count: { _all: true } });
  const sum = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((a, c) => a + c._count._all, 0);

  const data: ProposalRow[] = rows.map((r) => ({
    id: r.id,
    productId: r.product.id,
    model: r.product.normalizedName,
    sku: r.product.internalSku,
    brand: r.product.brand?.name ?? null,
    description: r.product.shortDescription?.slice(0, 140) ?? null,
    current: r.product.category?.tangoPath ? tangoPathLabel(r.product.category.tangoPath) : r.product.category?.name ?? null,
    proposed: tangoPathLabel(r.status === "APPROVED" && r.appliedPath ? r.appliedPath : r.tangoPath),
    note: r.status === "PENDING" ? r.note : null,
    status: r.status,
  }));
  const newBranches: NewBranch[] = branches.map((b) => ({
    id: b.id,
    path: b.tangoPath,
    label: tangoPathLabel(b.tangoPath),
    reason: b.reason,
    count: branchCounts.find((c) => c.tangoPath === b.tangoPath)?._count._all ?? 0,
  }));

  return (
    <div className="space-y-5">
      <RubrosTabs active="revision" />
      <PageHeader
        title="Reclasificación con el árbol de Tango"
        description="Pasá cada producto a su rubro de Tango (Rubro › Subrubro › Categoría › Tipo). No cambia ningún precio."
      />
      <ProposalsBoard
        stats={{
          safe: sum((c) => c.status === "PENDING" && c.confidence === "alta"),
          doubtful: sum((c) => c.status === "PENDING" && c.confidence !== "alta"),
          decided: sum((c) => c.status !== "PENDING"),
          approved: sum((c) => c.status === "APPROVED"),
        }}
        view={ver}
        filters={{ marca, q, page }}
        brands={brands.map((b) => b.name)}
        rows={data}
        matching={matching}
        pageSize={PAGE_SIZE}
        nodes={nodes}
        newBranches={newBranches}
        uncategorizedCount={uncategorizedCount}
      />
    </div>
  );
}

/** Bandeja «Para revisar uno a uno»: lo que está en «Sin categorizar» (o sin rubro). */
async function UncategorizedPage({ marca, q, page }: { marca: string; q: string; page: number }) {
  const base = await uncategorizedProductWhere();
  const where: Prisma.ProductWhereInput = {
    AND: [
      { isActive: true },
      base,
      ...(marca ? [{ brand: { name: marca } }] : []),
      ...(q ? [{ OR: [{ normalizedName: { contains: q, mode: "insensitive" as const } }, { internalSku: { contains: q } }] }] : []),
    ],
  };
  const [products, matching, brandRows, nodes] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ brand: { name: "asc" } }, { normalizedName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        normalizedName: true,
        internalSku: true,
        shortDescription: true,
        brand: { select: { name: true } },
        images: productCoverImageInclude,
        categoryProposals: {
          where: { batch: { in: [TANGO_BATCH, UNCATEGORIZED_BATCH] } },
          select: { batch: true, tangoPath: true, status: true, note: true, previousCategoryId: true },
        },
      },
    }),
    prisma.product.count({ where }),
    prisma.brand.findMany({ where: { products: { some: { AND: [{ isActive: true }, base] } } }, orderBy: { name: "asc" }, select: { name: true } }),
    listCategoryTree(),
  ]);
  const previousIds = [...new Set(products.flatMap((p) => p.categoryProposals.map((c) => c.previousCategoryId)).filter((id): id is string => !!id))];
  const proposalPaths = [...new Set(products.flatMap((p) => p.categoryProposals.filter((c) => c.batch === TANGO_BATCH).map((c) => c.tangoPath)))];
  const [previous, proposalNodes] = await Promise.all([
    prisma.category.findMany({ where: { id: { in: previousIds } }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { tangoPath: { in: proposalPaths } }, select: { id: true, tangoPath: true } }),
  ]);
  const previousName = new Map(previous.map((c) => [c.id, c.name]));
  const nodeByPath = new Map(proposalNodes.map((c) => [c.tangoPath!, c.id]));

  const rows: UncategorizedRow[] = products.map((p) => {
    const tango = p.categoryProposals.find((c) => c.batch === TANGO_BATCH && c.status !== "REJECTED");
    const moved = p.categoryProposals.find((c) => c.batch === UNCATEGORIZED_BATCH);
    return {
      productId: p.id,
      model: p.normalizedName,
      sku: p.internalSku,
      brand: p.brand?.name ?? null,
      image: p.images[0]?.url ?? null,
      description: p.shortDescription?.slice(0, 140) ?? null,
      previous: moved?.previousCategoryId ? previousName.get(moved.previousCategoryId) ?? null : null,
      proposal: tango ? { label: tangoPathLabel(tango.tangoPath), categoryId: nodeByPath.get(tango.tangoPath) ?? null, note: tango.note } : null,
    };
  });

  return (
    <div className="space-y-5">
      <RubrosTabs active="sin-rubro" />
      <PageHeader title="Sin rubro" description="Productos sin rubro, en «Sin categorizar» o con una categoría vieja fuera del árbol: elegí su rubro de Tango. Si hay reglas de precio por rubro y el precio cambia, pasa por Revisión de cambios." />
      <UncategorizedTray rows={rows} matching={matching} pageSize={PAGE_SIZE} filters={{ marca, q, page }} brands={brandRows.map((b) => b.name)} nodes={nodes} />
    </div>
  );
}
