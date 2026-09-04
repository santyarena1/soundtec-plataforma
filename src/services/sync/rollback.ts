import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SCALAR_PRODUCT_FIELDS } from "@/lib/field-timestamps";

export type RollbackResult = {
  ok: boolean;
  restored: number;
  deactivated: number;
  skipped: number;
  errors: string[];
  error?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error de rollback";
}

function asUpdateData(before: Record<string, unknown>): Prisma.ProductUncheckedUpdateInput {
  const data: Record<string, unknown> = {};
  for (const field of SCALAR_PRODUCT_FIELDS) {
    if (!(field in before)) continue;
    data[field] = before[field];
  }
  if ("searchKey" in before) data.searchKey = before.searchKey;
  return data as Prisma.ProductUncheckedUpdateInput;
}

/**
 * Revierte una sincronización aplicada:
 * - updates: restaura campos desde beforeJson
 * - creates: desactiva el producto (isActive=false) para no romper FKs
 *
 * Solo funciona en corridas COMPLETED en modo apply que tengan beforeJson.
 */
export async function rollbackSyncRun(runId: string): Promise<RollbackResult> {
  const run = await prisma.syncRun.findUnique({
    where: { id: runId },
    include: {
      staged: {
        where: { status: "applied" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) return { ok: false, restored: 0, deactivated: 0, skipped: 0, errors: [], error: "Proceso no encontrado." };
  if (run.mode !== "apply") {
    return {
      ok: false,
      restored: 0,
      deactivated: 0,
      skipped: 0,
      errors: [],
      error: "Solo se pueden revertir sincronizaciones aplicadas (no previsualizaciones).",
    };
  }
  if (run.status === "ROLLED_BACK") {
    return {
      ok: false,
      restored: 0,
      deactivated: 0,
      skipped: 0,
      errors: [],
      error: "Este proceso ya fue revertido.",
    };
  }
  if (run.status !== "COMPLETED") {
    return {
      ok: false,
      restored: 0,
      deactivated: 0,
      skipped: 0,
      errors: [],
      error: "Solo se pueden revertir procesos completados.",
    };
  }

  let restored = 0;
  let deactivated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of run.staged) {
    try {
      if (row.action === "noop") {
        skipped++;
        continue;
      }

      if (row.action === "create" && row.productId) {
        await prisma.product.update({
          where: { id: row.productId },
          data: { isActive: false },
        });
        await prisma.syncStagedProduct.update({
          where: { id: row.id },
          data: { status: "rolled_back" },
        });
        deactivated++;
        continue;
      }

      if (row.action === "update" && row.productId && row.beforeJson) {
        const before =
          typeof row.beforeJson === "object" && row.beforeJson && !Array.isArray(row.beforeJson)
            ? (row.beforeJson as Record<string, unknown>)
            : null;
        if (!before) {
          skipped++;
          continue;
        }
        await prisma.product.update({
          where: { id: row.productId },
          data: asUpdateData(before),
        });
        await prisma.syncStagedProduct.update({
          where: { id: row.id },
          data: { status: "rolled_back" },
        });
        restored++;
        continue;
      }

      skipped++;
    } catch (error) {
      errors.push(`${row.matchValue}: ${errorMessage(error)}`);
    }
  }

  await prisma.syncRun.update({
    where: { id: runId },
    data: {
      status: "ROLLED_BACK",
      rolledBackAt: new Date(),
      error:
        errors.length > 0
          ? `Revertido con ${errors.length} error(es). ${errors.slice(0, 3).join(" · ")}`
          : run.error,
      stats: {
        ...(run.stats && typeof run.stats === "object" && !Array.isArray(run.stats)
          ? (run.stats as Record<string, unknown>)
          : {}),
        rollback: { restored, deactivated, skipped, errorCount: errors.length },
      },
    },
  });

  return {
    ok: errors.length === 0,
    restored,
    deactivated,
    skipped,
    errors,
    error: errors.length > 0 ? `${errors.length} productos no se pudieron revertir.` : undefined,
  };
}
