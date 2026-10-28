import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { listCategoryTree, categoryPathLabel } from "@/lib/category-tree";
import { ensureQuoteServicesLoaded, linkServiceCategories } from "@/server/quote-services";
import { ServicesBoard, type ServiceRow } from "./services-board";

export const metadata = { title: "Admin · Servicios" };

/** Servicios para cotizar: solo los administra un admin. El equipo los ve al cotizar; los clientes, nunca. */
export default async function ServicesPage() {
  await requireAdmin();
  await ensureQuoteServicesLoaded();
  await linkServiceCategories();
  const [services, nodes] = await Promise.all([
    prisma.quoteService.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    listCategoryTree(),
  ]);
  const servicesRoot = nodes.find((n) => n.level === 1 && n.name.toLowerCase() === "servicios");
  // El selector de rubro muestra solo la rama SERVICIOS (si el árbol de Tango está cargado).
  const branch = servicesRoot ? nodes.filter((n) => n.id === servicesRoot.id || isUnder(n.id, servicesRoot.id, nodes)) : [];
  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    priceUsd: s.priceUsd == null ? null : Number(s.priceUsd),
    ivaPercent: Number(s.ivaPercent),
    categoryId: s.categoryId,
    categoryLabel: s.categoryId ? categoryPathLabel(s.categoryId, nodes) : null,
    isActive: s.isActive,
  }));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Servicios"
        description="Instalación, visitas, horas técnicas, mantenimiento y programación para agregar a las cotizaciones. Los precios son de venta, sin IVA. Los clientes no los ven; el equipo los usa al cotizar."
      />
      <ServicesBoard rows={rows} nodes={branch} />
    </div>
  );
}

function isUnder(id: string, rootId: string, nodes: Array<{ id: string; parentId: string | null }>): boolean {
  const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
  for (let p = parent.get(id); p; p = parent.get(p)) if (p === rootId) return true;
  return false;
}
