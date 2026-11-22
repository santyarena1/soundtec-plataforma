import { requireStaff } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { RubrosTabs } from "../rubros-tabs";
import { SeriesTab } from "./series-tab";

export const metadata = { title: "Admin · Series" };

/** Pestaña «Series» de Rubros (la barra de pestañas es la misma de /admin/categories). */
export default async function AdminSeriesPage() {
  await requireStaff("categories.manage");
  return (
    <div className="space-y-5">
      <PageHeader title="Rubros" description="Series y líneas de cada fabricante: revisalas, renombralas, unilas o sacales productos." />
      <RubrosTabs active="series" />
      <SeriesTab />
    </div>
  );
}
