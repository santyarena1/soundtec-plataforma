import type { Prisma } from "@prisma/client";
import { SCALAR_PRODUCT_FIELDS } from "@/lib/field-timestamps";

export type FieldChange = {
  field: string;
  from: unknown;
  to: unknown;
};

export type SyncDiff = {
  priceChanged: boolean;
  stockChanged: boolean;
  changedFields: string[];
  changes: FieldChange[];
};

function serializeValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const toNumber = (value as { toNumber?: unknown }).toNumber;
    if (typeof toNumber === "function") return Number(toNumber.call(value));
  }
  if (typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return value;
}

/** Snapshot plano de campos escalares + ids de taxonomía, apto para rollback. */
export function snapshotProductScalars(
  product: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of SCALAR_PRODUCT_FIELDS) {
    if (field in product) out[field] = serializeValue(product[field]);
  }
  // searchKey no está en SCALAR pero ayuda a restaurar búsqueda
  if ("searchKey" in product) out.searchKey = serializeValue(product.searchKey);
  return out;
}

export function buildFieldChanges(
  before: Record<string, unknown>,
  nextData: Record<string, unknown>
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of SCALAR_PRODUCT_FIELDS) {
    if (!(field in nextData) || nextData[field] === undefined) continue;
    const from = serializeValue(before[field]);
    const to = serializeValue(nextData[field]);
    if (from !== to && JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

export function toDiffJson(input: {
  priceChanged: boolean;
  stockChanged: boolean;
  changes: FieldChange[];
}): SyncDiff {
  return {
    priceChanged: input.priceChanged,
    stockChanged: input.stockChanged,
    changedFields: input.changes.map((c) => c.field),
    changes: input.changes,
  };
}

export function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
