import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { listCategoryTree } from "@/lib/category-tree";
import { tangoPathLabel } from "@/lib/tango-tree";
import { hiddenCategoryIdsFrom } from "@/lib/customer-hidden-categories";
import { countUncategorizedProducts } from "@/server/uncategorized";
import { TANGO_BATCH } from "@/server/category-proposals";
import { RubrosTabs, type RubrosTabId } from "./rubros-tabs";
import { RubrosTree, type RubroTreeNode } from "./rubros-tree";
import { EquivalencesTab, type EquivalenceRow } from "./equivalences-tab";
import { PendingTangoTab, type PendingTangoRow } from "./pending-tango-tab";

export const metadata = { title: "Admin · Rubros" };

type Search = { tab?: string };

/**
 * «Rubros»: el árbol de Tango con conteos y acciones por nodo, más las
 * equivalencias proveedor → rubro y los rubros pendientes de cargar en Tango.
 * «Sin rubro» y «Revisión» son las pantallas de la reclasificación y «Series»
 * la de series del fabricante (todas con la misma barra de pestañas).
 */
export default async function AdminRubrosPage({ searchParams }: { searchParams: Search }) {
  await requireStaff("categories.manage");
  // Pestañas que viven en otras pantallas (enlaces viejos o de los importadores).
  if (searchParams.tab === "sin-rubro") redirect("/admin/products/reclasificacion?ver=uno-a-uno");
  if (searchParams.tab === "revision") redirect("/admin/products/reclasificacion");
  if (searchParams.tab === "series") redirect("/admin/categories/series");
  const tab: RubrosTabId = searchParams.tab === "equivalencias" ? "equivalencias" : searchParams.tab === "pendientes-tango" ? "pendientes-tango" : "arbol";

  const [nodes, flags, uncategorized, pendingProposals, pendingTango] = await Promise.all([
    listCategoryTree(),
    prisma.category.findMany({ select: { id: true, parentId: true, name: true, tangoPath: true, hiddenFromCustomers: true } }),
    countUncategorizedProducts(),
    prisma.categoryProposal.count({ where: { batch: TANGO_BATCH, status: "PENDING", confidence: { not: "alta" } } }),
    prisma.category.count({ where: { pendingTango: true, isActive: true, tangoPath: { not: null } } }),
  ]);
  // Ocultos «de raíz» (el árbol marca también lo que cuelga de ellos).
  const hiddenAll = new Set(hiddenCategoryIdsFrom(flags));
  const parentOf = new Map(flags.map((f) => [f.id, f.parentId]));
  const hiddenRoots = new Set([...hiddenAll].filter((id) => !hiddenAll.has(parentOf.get(id) ?? "")));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rubros"
        description="El árbol de rubros de Tango (Rubro › Subrubro › Categoría › Tipo). Desde acá se renombra, se mueven productos, se unen rubros, se ocultan a clientes y se crean subrubros. Las reglas de precio por rubro alcanzan a todos sus subrubros."
      />
      <RubrosTabs
        active={tab}
        counts={{ "sin-rubro": uncategorized, revision: pendingProposals, "pendientes-tango": pendingTango }}
      />
      {tab === "arbol" ? (
        <RubrosTree nodes={nodes.map((n): RubroTreeNode => ({ ...n, hidden: hiddenRoots.has(n.id) }))} />
      ) : tab === "equivalencias" ? (
        <EquivalencesPanel nodes={nodes} />
      ) : (
        <PendingTangoPanel />
      )}
    </div>
  );
}

async function EquivalencesPanel({ nodes }: { nodes: Awaited<ReturnType<typeof listCategoryTree>> }) {
  const [rows, brands] = await Promise.all([
    prisma.categoryEquivalence.findMany({
      orderBy: [{ status: "desc" }, { sampleCount: "desc" }, { sourceLabel: "asc" }],
      select: {
        id: true,
        source: true,
        brandKey: true,
        sourceLabel: true,
        categoryId: true,
        status: true,
        sampleCount: true,
        sampleShare: true,
        category: { select: { tangoPath: true, name: true } },
      },
    }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const data: EquivalenceRow[] = rows.map((r) => ({
    id: r.id,
    source: r.source,
    brandId: r.brandKey || null,
    brandName: r.brandKey ? brandName.get(r.brandKey) ?? "Marca inactiva" : null,
    sourceLabel: r.sourceLabel,
    categoryId: r.categoryId,
    categoryPath: r.category.tangoPath ? tangoPathLabel(r.category.tangoPath) : r.category.name,
    status: r.status,
    sampleCount: r.sampleCount,
    sampleShare: r.sampleShare,
  }));
  return <EquivalencesTab rows={data} nodes={nodes} brands={brands} />;
}

async function PendingTangoPanel() {
  const rows = await prisma.category.findMany({
    where: { pendingTango: true, isActive: true, tangoPath: { not: null } },
    orderBy: { tangoPath: "asc" },
    select: { id: true, tangoPath: true, createdInAppBy: true, createdInAppAt: true, _count: { select: { products: true } } },
  });
  const data: PendingTangoRow[] = rows.map((r) => ({
    id: r.id,
    path: tangoPathLabel(r.tangoPath!),
    tangoPath: r.tangoPath!,
    products: r._count.products,
    createdBy: r.createdInAppBy,
    createdAt: r.createdInAppAt?.toISOString() ?? null,
  }));
  return <PendingTangoTab rows={data} />;
}
