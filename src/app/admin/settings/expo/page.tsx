import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_LABEL, eventStatus } from "@/lib/expo/event-status";
import { formatDate } from "@/lib/utils";
import { EventForm } from "./[id]/event-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("settings.manage");
  const events = await prisma.expoEvent.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { qrs: true, leads: true } } } });
  return (
    <div className="space-y-6">
      <SettingsSectionHeader href="/admin/settings/expo" />
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
