import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parsePermissions, permissionsHave, resolveEffectivePermissions } from "@/lib/permissions";
import type { IngestHistoricalResult, ParsedHistoricalSheet } from "@/lib/quote-history-parse";

export type { IngestHistoricalResult };

export function ingestFail(error: string, sheets = 0, lines = 0): IngestHistoricalResult {
  return { ok: false, error, sheets, lines };
}

/** Auth sin redirect: un redirect en Server Action hace que el cliente reciba undefined. */
export async function authorizeHistoryIngest(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Sesión expirada. Volvé a iniciar sesión." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      customRole: { select: { permissionsJson: true, isActive: true } },
    },
  });
  if (!dbUser) {
    return { ok: false, error: "Sesión expirada. Volvé a iniciar sesión." };
  }

  const customPerms = dbUser.customRole?.isActive
    ? parsePermissions(dbUser.customRole.permissionsJson as unknown)
    : null;
  const permissions = resolveEffectivePermissions({
    baseRole: dbUser.role,
    customPermissions: customPerms,
  });

  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return { ok: false, error: "No tenés permiso para ingestar planillas históricas." };
  }
  return { ok: true };
}

export async function persistHistoricalSheets(
  sourceFile: string,
  sheets: ParsedHistoricalSheet[]
): Promise<IngestHistoricalResult> {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return ingestFail("No se encontraron hojas con planillas reconocibles en el archivo.");
  }

  let savedSheets = 0;
  let savedLines = 0;

  for (const sheet of sheets) {
    const sheetName = String(sheet?.sheetName || "").trim();
    const lines = Array.isArray(sheet?.lines) ? sheet.lines : [];
    if (!sheetName || lines.length < 2) continue;

    const capped = lines
      .map((line) => ({
        description: String(line?.description || "").trim().slice(0, 2000),
        quantity:
          typeof line?.quantity === "number" && Number.isFinite(line.quantity) && line.quantity > 0
            ? line.quantity
            : null,
      }))
      .filter((line) => line.description.length > 0)
      .slice(0, 200);
    if (capped.length < 2) continue;

    try {
      const created = await prisma.historicalQuoteSheet.create({
        data: {
          sheetName,
          sourceFile: sourceFile || "Planillas de Cotizacion.xlsx",
          projectHint: sheetName,
        },
      });
      await prisma.historicalQuoteLine.createMany({
        data: capped.map((line) => ({
          sheetId: created.id,
          description: line.description,
          quantity: line.quantity != null ? new Prisma.Decimal(line.quantity) : null,
        })),
      });
      savedSheets += 1;
      savedLines += capped.length;
    } catch (error) {
      console.error("persistHistoricalSheets sheet", sheetName, error);
    }
  }

  if (savedSheets === 0) {
    return ingestFail("No se pudieron guardar hojas reconocibles. Reintentá o revisá el formato del Excel.");
  }
  return { ok: true, sheets: savedSheets, lines: savedLines };
}
