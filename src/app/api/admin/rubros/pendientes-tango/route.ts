import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { tangoCsvRow } from "@/lib/rubros";

export const dynamic = "force-dynamic";

/** CSV de rubros pendientes de cargar en Tango, con las 4 columnas del CSV que exporta Tango. */
export async function GET() {
  await requireStaff("categories.manage");
  const rows = await prisma.category.findMany({
    where: { pendingTango: true, isActive: true, tangoPath: { not: null } },
    orderBy: { tangoPath: "asc" },
    select: { tangoPath: true },
  });
  const header = '"Rubro";"Subrubro";"Nivel 3";"Nivel 4"';
  const body = [header, ...rows.map((r) => tangoCsvRow(r.tangoPath!))].join("\r\n");
  return new NextResponse(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rubros-pendientes-tango.csv"`,
    },
  });
}
