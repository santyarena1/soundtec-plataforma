import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { SoundTubePriceListPanel } from "./_client";

export const metadata = { title: "Admin · Lista de precios SoundTube" };
export const dynamic = "force-dynamic";

interface LastImport {
  at: string;
  fileName: string;
  updated: number;
  notInSystem: number;
  deactivated: number;
  priced: number;
}

function parseLastImport(raw: string): LastImport | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LastImport>;
    return parsed && typeof parsed.at === "string" ? (parsed as LastImport) : null;
  } catch {
    return null;
  }
}

export default async function SoundTubePricesPage() {
  await requireAdmin();
  const last = parseLastImport(await getSetting("soundtube.price_list_last_import", ""));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lista de precios SoundTube"
        description="Subí el Excel de SoundTube: SPRDIS US es el costo y MUP el markup de cada producto (se carga como regla). Se ignoran los precios grises y la columna PRECIO."
      />
      {last && (
        <p className="text-xs text-muted-foreground">
          Última lista aplicada: <span className="font-medium text-foreground">{last.fileName}</span> el{" "}
          {new Date(last.at).toLocaleString("es-AR")} · {last.updated} actualizados · {last.deactivated} desactivados ·{" "}
          {last.priced} con precio manual · {last.notInSystem} SKUs del Excel sin producto.{" "}
          <Link href="/admin/margins" className="hover:underline">Ver reglas</Link>
        </p>
      )}
      <SoundTubePriceListPanel />
    </div>
  );
}
