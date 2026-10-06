import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABEL, eventStatus } from "@/lib/expo/event-status";
import { buildExpoReport } from "@/lib/expo/report";
import { formatDate } from "@/lib/utils";
import { toggleExpoQr } from "@/server/actions/expo-events";
import { EventForm } from "./event-form";
import { QrForm } from "./qr-form";
import { ShowcasePicker } from "./showcase-picker";
import { getShowcaseProducts } from "@/server/expo/showcase";
import { getEquipmentBrands } from "@/lib/catalog-brands";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("settings.manage");
  const { id } = await params;
  const event = await prisma.expoEvent.findUnique({ where: { id }, include: { qrs: { orderBy: { createdAt: "asc" } } } });
  if (!event) notFound();
  const [showcase, autoPreview, brandList] = await Promise.all([
    event.showcaseProductIds.length
      ? getShowcaseProducts(40, event.showcaseProductIds).then((rows) => rows.map(({ score: _score, ...p }) => p))
      : Promise.resolve([]),
    // Lo que pasa hoy en la pantalla si no se eligen productos a mano.
    getShowcaseProducts(24, []).then((rows) => rows.map(({ score: _score, ...p }) => p)),
    getEquipmentBrands(),
  ]);
  const brandNames = brandList.filter((b) => !b.query).map((b) => b.name).sort((a, b) => a.localeCompare(b, "es"));
  const qrIds = event.qrs.map((q) => q.id);
  const visits = await prisma.expoVisit.findMany({ where: { qrId: { in: qrIds } }, select: { qrId: true, visitorId: true, type: true, brandId: true } });
  const brandIds = [...new Set(visits.map((v) => v.brandId).filter((b): b is string => !!b))];
  const brands = await prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } });
  const report = buildExpoReport(visits, Object.fromEntries(brands.map((b) => [b.id, b.name])));
  const status = eventStatus(event);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="space-y-6">
      <Link href="/admin/settings/expo" className="text-sm text-muted-foreground hover:underline">← Eventos</Link>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{event.name}</h2>
        <Badge tone={status === "LIVE" ? "success" : "muted"}>{EVENT_STATUS_LABEL[status]}</Badge>
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">{formatDate(event.startsAt)} → {formatDate(event.endsAt)} (hora de Argentina)</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Escaneos", report.totals.scans.toLocaleString("es-AR")],
          ["Dejaron sus datos", `${report.totals.leads} (${pct(report.totals.leadRate)})`],
          ["Pidieron cuenta", String(report.totals.accountRequests)],
          ["Marca más vista", report.topBrands[0]?.name ?? "—"],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-4"><p className="text-xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">QR del evento</h3>
            <div className="flex gap-4">
              <Link href={`/admin/leads?event=${event.id}`} className="text-sm font-medium text-primary underline">Ver leads en CRM</Link>
              <a href={`/api/admin/expo/events/${event.id}/leads`} className="text-sm font-medium text-primary underline">Descargar leads (Excel)</a>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">QR</th><th>Escaneos</th><th>Leads</th><th>Cuentas</th><th /></tr></thead>
              <tbody>
                {event.qrs.map((qr) => {
                  const c = report.byQr[qr.id] ?? { scans: 0, leads: 0, accountRequests: 0 };
                  return (
                    <tr key={qr.id} className="border-t border-border">
                      <td className="py-2">{qr.label} {!qr.isActive ? <Badge tone="muted">inactivo</Badge> : null}<div className="text-xs text-muted-foreground">/e/{qr.code}</div></td>
                      <td>{c.scans}</td><td>{c.leads}</td><td>{c.accountRequests}</td>
                      <td className="space-x-3 whitespace-nowrap text-right text-xs">
                        <a className="underline" href={`/expo/pantalla/${qr.code}?o=h`} target="_blank" rel="noreferrer">Abrir horizontal</a>
                        <a className="underline" href={`/expo/pantalla/${qr.code}?o=v`} target="_blank" rel="noreferrer">Abrir vertical</a>
                        <a className="underline" href={`/api/admin/expo/qr/${qr.code}`}>Descargar PNG</a>
                        <form action={toggleExpoQr.bind(null, qr.id)} className="inline"><button className="underline">{qr.isActive ? "Desactivar" : "Activar"}</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <QrForm eventId={event.id} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h3 className="text-sm font-semibold">Vidriera de la pantalla del stand</h3>
            <p className="text-xs text-muted-foreground">Elegí qué productos pasan en la pantalla y en qué orden. Si no elegís ninguno, la pantalla muestra automáticamente los más relevantes de cada marca.</p>
          </div>
          <ShowcasePicker eventId={event.id} initial={showcase} autoPreview={autoPreview} brands={brandNames} />
        </CardContent>
      </Card>

      {report.topBrands.length ? (
        <Card><CardContent className="p-5">
          <h3 className="mb-2 text-sm font-semibold">Marcas más vistas</h3>
          <ol className="space-y-1 text-sm">{report.topBrands.slice(0, 10).map((b) => <li key={b.brandId}>{b.name} · {b.views}</li>)}</ol>
        </CardContent></Card>
      ) : null}
      <Card><CardContent className="p-5"><h3 className="mb-3 text-sm font-semibold">Datos del evento</h3>
        <EventForm event={{ id: event.id, name: event.name, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), displayOrientation: event.displayOrientation }} />
      </CardContent></Card>
    </div>
  );
}
