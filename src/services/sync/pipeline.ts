import { Prisma, type SyncSourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConnector, listConnectors } from "./registry";
import { applyNormalizedProduct } from "./upsert";
import type { NormalizedProduct } from "./types";

export interface ProcessBatchResult {
  done: boolean;
  processed: number;
  total: number;
  nextOffset: number | null;
  created: number;
  updated: number;
  priceChanges: number;
  stockChanges: number;
  errors: number;
}

type ExistingProduct = {
  id: string;
  matchValue: string;
  baseCostUsd: Prisma.Decimal;
  stockStatus: NormalizedProduct["stockStatus"];
};

const NON_SCALAR_KEYS = new Set<keyof NormalizedProduct>([
  "raw",
  "images",
  "specifications",
  "documents",
  "accessorySkus",
  "crossSellSkus",
  "alsoPurchasedSkus",
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown sync error";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Sync payload is not JSON serializable");
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function withoutRaw(item: NormalizedProduct): Omit<NormalizedProduct, "raw"> {
  const { raw: _raw, ...normalized } = item;
  return normalized;
}

function changedFieldsFor(
  item: NormalizedProduct,
  existing: ExistingProduct | undefined
): string[] {
  const changed = new Set<string>();

  if (!existing) {
    changed.add(item.matchField);
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined || NON_SCALAR_KEYS.has(key as keyof NormalizedProduct)) {
        continue;
      }
      if (key === "matchField" || key === "matchValue") continue;
      if (key === "name" || key === "normalizedNameOverride") {
        changed.add("normalizedName");
      } else {
        changed.add(key);
      }
    }
    return Array.from(changed);
  }

  if (item.normalizedNameOverride?.trim()) changed.add("normalizedName");
  if (
    item.baseCostUsd != null &&
    Number(existing.baseCostUsd) !== item.baseCostUsd
  ) {
    changed.add("baseCostUsd");
  }
  if (
    item.stockStatus != null &&
    existing.stockStatus !== item.stockStatus
  ) {
    changed.add("stockStatus");
  }

  for (const [key, value] of Object.entries(item)) {
    if (value === undefined || NON_SCALAR_KEYS.has(key as keyof NormalizedProduct)) {
      continue;
    }
    if (
      key === "matchField" ||
      key === "matchValue" ||
      key === "name" ||
      key === "normalizedNameOverride" ||
      key === "baseCostUsd" ||
      key === "stockStatus"
    ) {
      continue;
    }
    changed.add(key);
  }

  return Array.from(changed);
}

async function loadExistingProducts(
  matchField: "internalSku" | "supplierSku",
  matchValues: string[]
): Promise<Map<string, ExistingProduct>> {
  if (matchValues.length === 0) return new Map();

  if (matchField === "internalSku") {
    const products = await prisma.product.findMany({
      where: { internalSku: { in: matchValues } },
      select: {
        id: true,
        internalSku: true,
        baseCostUsd: true,
        stockStatus: true,
      },
    });
    return new Map(
      products
        .filter((product) => !!product.internalSku)
        .map((product) => [
          product.internalSku!,
          {
            id: product.id,
            matchValue: product.internalSku!,
            baseCostUsd: product.baseCostUsd,
            stockStatus: product.stockStatus,
          },
        ])
    );
  }

  const products = await prisma.product.findMany({
    where: { supplierSku: { in: matchValues } },
    select: {
      id: true,
      supplierSku: true,
      baseCostUsd: true,
      stockStatus: true,
    },
  });
  return new Map(
    products
      .filter((product) => !!product.supplierSku)
      .map((product) => [
        product.supplierSku!,
        {
          id: product.id,
          matchValue: product.supplierSku!,
          baseCostUsd: product.baseCostUsd,
          stockStatus: product.stockStatus,
        },
      ])
  );
}

export async function startRun(
  slug: string,
  mode: "preview" | "apply",
  trigger: "MANUAL" | "CRON" = "MANUAL"
): Promise<{ runId: string }> {
  const connector = getConnector(slug);
  if (!connector) throw new Error(`Unknown sync connector: ${slug}`);

  const run = await prisma.syncRun.create({
    data: {
      source: connector.source as SyncSourceKind,
      status: "RUNNING",
      trigger,
      mode,
      totalItems: 0,
      processed: 0,
    },
    select: { id: true },
  });
  return { runId: run.id };
}

export async function processBatch(
  runId: string,
  batchSize = 25
): Promise<ProcessBatchResult> {
  const run = await prisma.syncRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Sync run not found: ${runId}`);

  if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
    return {
      done: true,
      processed: run.processed,
      total: run.totalItems,
      nextOffset: null,
      created: run.created,
      updated: run.updated,
      priceChanges: run.priceChanges,
      stockChanges: run.stockChanges,
      errors: run.errors,
    };
  }

  try {
    const connector = listConnectors().find(
      (candidate) => candidate.source === run.source
    );
    if (!connector) {
      throw new Error(`No connector registered for source: ${run.source}`);
    }

    const fetched = await connector.fetchNormalized({
      offset: run.processed,
      batchSize,
    });

    if (run.mode === "apply" && connector.translateItems) {
      try {
        await connector.translateItems(fetched.items);
      } catch (translationError) {
        const translationMessage =
          `Translation failed: ${errorMessage(translationError)}`;
        await prisma.syncRun.update({
          where: { id: run.id },
          data: { error: translationMessage },
        }).catch(() => undefined);
      }
    }

    if (run.totalItems === 0 && fetched.total > 0) {
      const currentStats =
        run.stats && typeof run.stats === "object" && !Array.isArray(run.stats)
          ? run.stats as Record<string, Prisma.JsonValue>
          : {};
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          totalItems: fetched.total,
          stats: fetched.brandCounts
            ? toJson({ ...currentStats, brandCounts: fetched.brandCounts })
            : toJson(currentStats),
        },
      });
    }

    const matchValues = Array.from(
      new Set(fetched.items.map((item) => item.matchValue.trim()).filter(Boolean))
    );
    const existingByMatch = await loadExistingProducts(
      connector.matchField,
      matchValues
    );

    const rows = fetched.items.map((item) => {
      const existing = existingByMatch.get(item.matchValue.trim());
      const priceChanged =
        !!existing &&
        item.baseCostUsd != null &&
        Number(existing.baseCostUsd) !== item.baseCostUsd;
      const stockChanged =
        !!existing &&
        item.stockStatus != null &&
        existing.stockStatus !== item.stockStatus;
      return {
        item,
        existing,
        action: existing ? "update" as const : "create" as const,
        priceChanged,
        stockChanged,
        changedFields: changedFieldsFor(item, existing),
      };
    });

    const matched = rows.filter((row) => !!row.existing).length;
    const priceChanges = rows.filter((row) => row.priceChanged).length;
    const stockChanges = rows.filter((row) => row.stockChanged).length;
    let created = 0;
    let updated = 0;
    let errors = 0;

    if (run.mode === "apply") {
      for (const row of rows) {
        const stagedBase = {
          syncRunId: run.id,
          matchValue: row.item.matchValue,
          rawJson: toJson(row.item.raw),
          normalizedJson: toJson(withoutRaw(row.item)),
          diffJson: toJson({
            priceChanged: row.priceChanged,
            stockChanged: row.stockChanged,
            changedFields: row.changedFields,
          }),
        };
        try {
          const applied = await prisma.$transaction((tx) =>
            applyNormalizedProduct(tx, row.item)
          );
          if (applied.action === "create") created++;
          else updated++;
          await prisma.syncStagedProduct.create({
            data: {
              ...stagedBase,
              action: applied.action,
              status: "applied",
              productId: applied.productId,
            },
          });
        } catch (error) {
          errors++;
          await prisma.syncStagedProduct.create({
            data: {
              ...stagedBase,
              action: row.action,
              status: "error",
              error: errorMessage(error),
            },
          });
        }
      }
    } else {
      created = rows.filter((row) => row.action === "create").length;
      updated = rows.filter((row) => row.action === "update").length;
      if (rows.length > 0) {
        await prisma.syncStagedProduct.createMany({
          data: rows.map((row) => ({
            syncRunId: run.id,
            matchValue: row.item.matchValue,
            rawJson: toJson(row.item.raw),
            normalizedJson: toJson(withoutRaw(row.item)),
            diffJson: toJson({
              priceChanged: row.priceChanged,
              stockChanged: row.stockChanged,
              changedFields: row.changedFields,
            }),
            action: row.action,
            status: "pending",
          })),
        });
      }
    }

    const completed = fetched.done;
    const nextProcessed = fetched.nextOffset ?? (completed ? fetched.total : run.processed + fetched.items.length);
    const processedIncrement = Math.max(0, nextProcessed - run.processed);
    const updatedRun = await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        totalItems: run.totalItems === 0 ? fetched.total : undefined,
        processed: { increment: processedIncrement },
        matched: { increment: matched },
        created: { increment: created },
        updated: { increment: updated },
        priceChanges: { increment: priceChanges },
        stockChanges: { increment: stockChanges },
        errors: { increment: errors },
        status: completed
          ? "COMPLETED"
          : run.mode === "apply"
            ? "APPLYING"
            : "PREVIEW_READY",
        finishedAt: completed ? new Date() : undefined,
      },
    });

    return {
      done: completed,
      processed: updatedRun.processed,
      total: updatedRun.totalItems,
      nextOffset: fetched.nextOffset,
      created: updatedRun.created,
      updated: updatedRun.updated,
      priceChanges: updatedRun.priceChanges,
      stockChanges: updatedRun.stockChanges,
      errors: updatedRun.errors,
    };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    }).catch(() => undefined);
    throw error;
  }
}

export async function runToCompletion(
  runId: string,
  batchSize = 25,
  maxBatches = 200
): Promise<void> {
  const limit = Math.max(0, Math.trunc(maxBatches));
  for (let batch = 0; batch < limit; batch++) {
    const result = await processBatch(runId, batchSize);
    if (result.done) return;
  }
}
