import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { seesMarketing } from "@/server/dashboard/marketing";
import { seesQuotes, type DashboardViewer } from "@/server/dashboard/viewer";
import { InboxBlock } from "./inbox-block";
import { CallBlock, InterestBlock, PortalBlock } from "./clients-blocks";
import { CommercialBlock } from "./commercial-block";
import { CatalogHealthBlock, SyncBlock } from "./catalog-blocks";
import { MarketingBlock } from "./marketing-block";
import { BlockSkeleton } from "./ui";

/**
 * Cuerpo del inicio: cada bloque es un Server Component con su Suspense y su
 * esqueleto, así la página no espera al más lento y si uno falla muestra un
 * aviso chico sin romper el resto. Orden: bandeja, clientes, comercial,
 * catálogo, marketing. Grilla de 12 columnas: el ancho de cada bloque sigue
 * lo que pesa, no es una pila de tarjetas iguales.
 */
export function DashboardBlocks({ viewer }: { viewer: DashboardViewer }) {
  const clients = viewer.seesClients;
  const catalog = viewer.isAdmin || viewer.can("products.view");
  const sync = viewer.isAdmin;

  const rows: Array<Array<{ key: string; span: string; rows: number; title: string; node: ReactNode }>> = [
    [
      { key: "inbox", span: clients ? "lg:col-span-7" : "lg:col-span-12", rows: 5, title: "Para hacer hoy", node: <InboxBlock viewer={viewer} /> },
      ...(clients ? [{ key: "call", span: "lg:col-span-5", rows: 5, title: "Para llamar", node: <CallBlock viewer={viewer} /> }] : []),
    ],
    [
      { key: "interest", span: clients ? "lg:col-span-7" : "lg:col-span-12", rows: 6, title: "Qué miran y qué buscan", node: <InterestBlock viewer={viewer} /> },
      ...(clients ? [{ key: "portal", span: "lg:col-span-5", rows: 6, title: "Clientes en el portal", node: <PortalBlock viewer={viewer} /> }] : []),
    ],
    seesQuotes(viewer) ? [{ key: "commercial", span: "lg:col-span-12", rows: 4, title: "Comercial del mes", node: <CommercialBlock viewer={viewer} /> }] : [],
    [
      ...(catalog ? [{ key: "catalog", span: sync ? "lg:col-span-8" : "lg:col-span-12", rows: 4, title: "Salud del catálogo", node: <CatalogHealthBlock viewer={viewer} /> }] : []),
      ...(sync ? [{ key: "sync", span: catalog ? "lg:col-span-4" : "lg:col-span-12", rows: 4, title: "Sincronizaciones", node: <SyncBlock /> }] : []),
    ],
    seesMarketing(viewer) ? [{ key: "marketing", span: "lg:col-span-12", rows: 3, title: "Marketing", node: <MarketingBlock viewer={viewer} /> }] : [],
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 xl:gap-5">
      {rows.flat().map((b) => (
        <div key={b.key} className={cn("flex min-w-0 [&>*]:w-full", b.span)}>
          <Suspense fallback={<BlockSkeleton rows={b.rows} title={b.title} />}>{b.node}</Suspense>
        </div>
      ))}
    </div>
  );
}
