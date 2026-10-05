import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { HallResearchPriceListPanel } from "./_client";

export const metadata = { title: "Admin · Lista de precios Hall Research" };
export const dynamic = "force-dynamic";
// Aplicar una lista completa crea o actualiza cientos de productos en una transacción.
export const maxDuration = 300;

interface LastImport {
  at: string;
  fileName: string;
  updated: number;
  created: number;
  deactivated: number;
  priced: number;
  reactivated: number;
}

function parseLastImport(raw: string): LastImport | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LastImport>;
    return parsed && typeof parsed.at === "string" ? (parsed as LastImport) : null;
  } catch {
    return null;
  }
}

export default async function HallResearchPricesPage() {
  await requireAdmin();
  const last = parseLastImport(await getSetting("hall_research.price_list_last_import", ""));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lista de precios Hall Research"
        description="Atlona, Javelin, Hall Tech, Gain Audio y Captivate. «Distributor» es el costo; el MSRP se guarda solo para consulta. A los productos que ya existen solo se les actualiza costo y MSRP; los nuevos se crean con los datos de la lista."
      />
      {last && (
        <p className="text-xs text-muted-foreground">
          Última lista aplicada: <span className="font-medium text-foreground">{last.fileName}</span> el{" "}
          {new Date(last.at).toLocaleString("es-AR")} · {last.updated} actualizados · {last.created} creados ·{" "}
          {last.deactivated} desactivados · {last.priced} con costo manual.{" "}
          <Link href="/admin/sync" className="hover:underline">Enriquecer desde hallresearch.com</Link>
        </p>
      )}
      <HallResearchPriceListPanel />
    </div>
  );
}
