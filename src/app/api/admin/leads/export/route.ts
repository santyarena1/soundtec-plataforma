import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { sanitizeSpreadsheetCell } from "@/lib/expo/spreadsheet";

export const dynamic = "force-dynamic";

/**
 * Excel de leads del catálogo con los mismos filtros que CRM → Leads.
 * Visible siempre (no hace falta elegir un evento).
 */
export async function GET(req: NextRequest) {
  await requirePermission("clients.view");
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || undefined;
  const eventId = searchParams.get("event") || undefined;
  const source =
    searchParams.get("source") === "QR" || searchParams.get("source") === "WEB"
      ? searchParams.get("source")
      : undefined;

  const where: Prisma.VisitorLeadWhereInput = {
    ...(eventId ? { eventId } : {}),
    ...(source === "QR" || source === "WEB" ? { source } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { interest: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const leads = await prisma.visitorLead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      event: { select: { name: true } },
      qr: { select: { label: true } },
    },
  });

  const requests = leads.length
    ? await prisma.accountRequest.findMany({
        where: {
          OR: [
            { leadId: { in: leads.map((l) => l.id) } },
            { email: { in: leads.map((l) => l.email), mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: {
          leadId: true,
          email: true,
          status: true,
          company: true,
          activity: true,
          activityOther: true,
        },
      })
    : [];

  const requestFor = (lead: { id: string; email: string }) =>
    requests.find((r) => r.leadId === lead.id) ??
    requests.find((r) => r.email.toLowerCase() === lead.email.toLowerCase());

  const visitorIds = [...new Set(leads.map((l) => l.visitorId).filter(Boolean))];
  const visitGroups = visitorIds.length
    ? await prisma.expoVisit.groupBy({
        by: ["visitorId", "type"],
        where: { visitorId: { in: visitorIds } },
        _count: { _all: true },
      })
    : [];
  const visitCount = (visitorId: string, type: string) =>
    visitGroups.find((g) => g.visitorId === visitorId && g.type === type)?._count._all ?? 0;

  const brandViewRows = visitorIds.length
    ? await prisma.expoVisit.findMany({
        where: { visitorId: { in: visitorIds }, type: "BRAND_VIEW", brandId: { not: null } },
        select: { visitorId: true, brandId: true },
        distinct: ["visitorId", "brandId"],
      })
    : [];
  const brandIds = [...new Set(brandViewRows.map((r) => r.brandId!).filter(Boolean))];
  const brands = brandIds.length
    ? await prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } })
    : [];
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const brandsFor = (visitorId: string) =>
    brandViewRows
      .filter((r) => r.visitorId === visitorId && r.brandId)
      .map((r) => brandName.get(r.brandId!) ?? r.brandId!)
      .filter(Boolean)
      .join(", ");

  const REQUEST_LABEL = { PENDING: "Pidió cuenta", APPROVED: "Cuenta aprobada", REJECTED: "Cuenta rechazada" } as const;
  const cell = (value: string | null | undefined) => sanitizeSpreadsheetCell(value ?? "");

  const rows = [
    [
      "Fecha",
      "Origen",
      "Evento",
      "QR",
      "Mail",
      "Nombre",
      "Empresa",
      "Teléfono",
      "Interés",
      "Pedido de cuenta",
      "Actividad (pedido)",
      "Escaneos",
      "Cant. marcas vistas",
      "Marcas vistas",
    ],
    ...leads.map((l) => {
      const req = requestFor(l);
      const activity =
        req?.activity === "Otra" ? req.activityOther ?? "Otra" : req?.activity ?? "";
      return [
        l.createdAt.toISOString().slice(0, 16).replace("T", " "),
        l.source,
        cell(l.event?.name),
        cell(l.qr?.label),
        cell(l.email),
        cell(l.name),
        cell(l.company),
        cell(l.phone),
        cell(l.interest),
        req ? REQUEST_LABEL[req.status] : "",
        cell(activity),
        visitCount(l.visitorId, "SCAN"),
        visitCount(l.visitorId, "BRAND_VIEW"),
        cell(brandsFor(l.visitorId)),
      ];
    }),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Leads");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads-catalogo-${stamp}.xlsx"`,
    },
  });
}
