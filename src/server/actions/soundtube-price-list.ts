"use server";

import { requireAdmin } from "@/lib/auth-helpers";
import {
  MAX_FILE_BYTES,
  applySoundTubeRows,
  decisionsSchema,
  loadSkuAliases,
  loadSoundTubeProducts,
  type MissingDecision,
} from "@/server/soundtube/price-list-core";
import { parsePriceListFile, type ParsedPriceList, type PriceListRow } from "@/services/soundtube/price-list";
export type { MissingDecision } from "@/server/soundtube/price-list-core";
import { buildPriceListPlan } from "@/services/soundtube/price-list-plan";

export interface PreviewMatched {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  excelRow: number;
  oldCost: number;
  newCost: number;
  mup: number;
  isActive: boolean;
  /** SKU como viene en el Excel cuando difiere solo en espacios o guiones. */
  excelSku?: string;
  categoria?: string;
  segmento?: string;
  familia?: string;
  tipo?: string;
}

export interface PreviewMissing {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  cost: number;
  isActive: boolean;
}

export interface PriceListPreview {
  ok: true;
  fileName: string;
  matched: PreviewMatched[];
  notInSystem: PriceListRow[];
  missing: PreviewMissing[];
  warnings: ParsedPriceList["warnings"];
  invalid: ParsedPriceList["invalid"];
}

type Failure = { ok: false; error: string };

async function readUpload(formData: FormData): Promise<{ parsed: ParsedPriceList; fileName: string } | Failure> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí el Excel de la lista." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "El archivo es demasiado grande (máx. 10 MB)." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { ok: false, error: "Tiene que ser un archivo .xlsx o .xls." };
  try {
    const parsed = parsePriceListFile(Buffer.from(await file.arrayBuffer()));
    if (parsed.rows.length === 0) return { ok: false, error: "El Excel no tiene filas con costo y MUP." };
    return { parsed, fileName: file.name };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el Excel." };
  }
}

export async function previewSoundTubePriceList(formData: FormData): Promise<PriceListPreview | Failure> {
  await requireAdmin();
  const upload = await readUpload(formData);
  if ("ok" in upload) return upload;
  const plan = buildPriceListPlan(upload.parsed.rows, await loadSoundTubeProducts(), await loadSkuAliases());

  return {
    ok: true,
    fileName: upload.fileName,
    matched: plan.matched.map(({ product, row, looseMatch, aliasMatch }) => ({
      productId: product.id,
      sku: product.sku ?? row.sku,
      name: product.name,
      brand: product.brand,
      excelRow: row.excelRow,
      oldCost: product.costUsd,
      newCost: row.costUsd,
      mup: row.mup,
      isActive: product.isActive,
      excelSku: looseMatch || aliasMatch ? row.sku : undefined,
      categoria: row.categoria,
      segmento: row.segmento,
      familia: row.familia,
      tipo: row.tipo,
    })),
    notInSystem: plan.notInSystem,
    missing: plan.missing.map((p) => ({
      productId: p.id,
      sku: p.sku ?? "",
      name: p.name,
      brand: p.brand,
      cost: p.costUsd,
      isActive: p.isActive,
    })),
    warnings: upload.parsed.warnings,
    invalid: upload.parsed.invalid,
  };
}

export async function applySoundTubePriceList(
  formData: FormData
): Promise<{ ok: true; updated: number; deactivated: number; priced: number } | Failure> {
  await requireAdmin();
  const upload = await readUpload(formData);
  if ("ok" in upload) return upload;

  let decisions: MissingDecision[];
  try {
    decisions = decisionsSchema.parse(JSON.parse(String(formData.get("decisions") ?? "[]")));
  } catch {
    return { ok: false, error: "Las decisiones sobre los productos que quedan afuera no son válidas." };
  }
  const applyTaxonomy = formData.get("applyTaxonomy") === "true";

  return applySoundTubeRows({ rows: upload.parsed.rows, fileName: upload.fileName, decisions, applyTaxonomy });
}
