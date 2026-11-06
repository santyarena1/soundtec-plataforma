import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABEL, eventStatus } from "@/lib/expo/event-status";
import { formatDate } from "@/lib/utils";
import { EventForm } from "./[id]/event-form";
import { catalogQrSvg, catalogQrUrl } from "@/server/expo/catalog-qr";
import { Download, Infinity as InfinityIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("settings.manage");
  const events = await prisma.expoEvent.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { qrs: true, leads: true } } } });
  return (
    <div className="space-y-6">
      <SettingsSectionHeader href="/admin/settings/expo" />
      <Card>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div
            className="mx-auto h-40 w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-white sm:mx-0"
            aria-label="QR permanente del catálogo"
            role="img"
            dangerouslySetInnerHTML={{ __html: catalogQrSvg() }}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">QR permanente del catálogo</h3>
              <Badge tone="success">
                <InfinityIcon className="mr-1 h-3.5 w-3.5" /> Sin vencimiento
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Lleva al catálogo con todas las marcas. No depende de ningún evento, no vence y se puede imprimir y usar sin límite (folletos, stands, vidrieras, tarjetas).
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={catalogQrUrl()}>{catalogQrUrl()}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="/api/admin/expo/catalog-qr?formato=pdf" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" /> PDF vectorial
              </a>
              <a href="/api/admin/expo/catalog-qr?formato=svg" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary">
                <Download className="h-4 w-4" /> SVG
              </a>
              <a href="/api/admin/expo/catalog-qr?formato=png" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary">
                <Download className="h-4 w-4" /> PNG
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-5"><h3 className="mb-3 text-sm font-semibold">Nuevo evento</h3><EventForm /></CardContent></Card>
      <div className="space-y-2">
        {events.map((ev) => {
          const status = eventStatus(ev);
          return (
            <Link key={ev.id} href={`/admin/settings/expo/${ev.id}`} className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{ev.name}</p>
                <Badge tone={status === "LIVE" ? "success" : "muted"}>{EVENT_STATUS_LABEL[status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(ev.startsAt)} → {formatDate(ev.endsAt)} · {ev._count.qrs} QR · {ev._count.leads} leads</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
