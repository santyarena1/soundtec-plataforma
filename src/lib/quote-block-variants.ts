/**
 * Versiones de los textos fijos del PDF (presentación, instalación, cierre…).
 *
 * Cada versión dice para qué tipo de presupuesto y para qué rubro se usa
 * (tabla QuoteTextVariant). El texto general es el de la plantilla (QuoteBlock).
 * La elección automática vive en quote-text-variant-pick (pura) y se aplica en
 * quote-text-variants-apply.
 */

import { prisma } from "@/lib/prisma";
import { getSetting, setSetting } from "@/lib/settings";

/** Textos fijos que admiten versiones. Quedan afuera los que salen de Configuración (condiciones), las imágenes y lo que redacta la IA. */
export const VARIANT_BLOCK_KEYS = [
  "letter_open",
  "corporate_intro",
  "disciplines",
  "installation",
  "staff",
  "warranty",
  "satisfaction",
  "iso",
  "closing",
] as const;

export type VariantBlockKey = (typeof VARIANT_BLOCK_KEYS)[number];

export function isVariantBlockKey(key: string): key is VariantBlockKey {
  return (VARIANT_BLOCK_KEYS as readonly string[]).includes(key);
}

export type QuoteBlockVariant = {
  /** Id de la versión (se guarda en QuoteSection.variantSlug). */
  slug: string;
  label: string;
  body: string;
  profiles: string[];
  audiences: string[];
  updatedAt: Date;
};

type Row = { id: string; label: string; body: string; profiles: string[]; audiences: string[]; updatedAt: Date };
const toVariant = (row: Row): QuoteBlockVariant => ({
  slug: row.id,
  label: row.label,
  body: row.body,
  profiles: row.profiles,
  audiences: row.audiences,
  updatedAt: row.updatedAt,
});

// --- Versiones viejas (JSON en adminSetting) → tabla, una sola vez ---------------
const LEGACY_KEYS = ["disciplines", "corporate_intro", "installation"] as const;
type LegacyVariant = { slug: string; label: string; body: string; isDefault?: boolean };
let legacyChecked: Promise<void> | null = null;

async function migrateLegacyVariants() {
  for (const blockKey of LEGACY_KEYS) {
    const settingKey = `quotes.block_variants.${blockKey}`;
    let legacy: LegacyVariant[] = [];
    try {
      const parsed = JSON.parse(await getSetting(settingKey, "[]"));
      legacy = Array.isArray(parsed) ? parsed : [];
    } catch {
      legacy = [];
    }
    if (!legacy.length) continue;
    for (const v of legacy) {
      if (!v?.slug || !v.body) continue;
      // El slug viejo era único solo dentro de su texto: el id lleva el texto adelante.
      const id = legacyVariantId(blockKey, v.slug);
      await prisma.quoteTextVariant.upsert({
        where: { id },
        update: {},
        // La «predeterminada» de antes reemplazaba al general en todas: se conserva así.
        create: {
          id,
          blockKey,
          label: v.label || "Versión",
          body: v.body,
          profiles: v.isDefault ? ["resumido", "tecnico", "premium"] : [],
          audiences: [],
        },
      });
    }
    await setSetting(settingKey, "[]", { description: `Migrado a QuoteTextVariant (${blockKey})` });
  }
}

const legacyVariantId = (blockKey: string, slug: string) => `${blockKey}:${slug}`;

/** Las cotizaciones viejas guardan el slug suelto; las nuevas, el id. */
const variantIdsFor = (blockKey: string, slug: string) => [slug, legacyVariantId(blockKey, slug)];

function ensureLegacyMigrated() {
  legacyChecked ??= migrateLegacyVariants().catch((error) => {
    legacyChecked = null;
    console.error("[quote-variants] no se pudieron migrar las versiones viejas", error);
  });
  return legacyChecked;
}

export async function listBlockVariants(blockKey: string): Promise<QuoteBlockVariant[]> {
  await ensureLegacyMigrated();
  const rows = await prisma.quoteTextVariant.findMany({
    where: { blockKey, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toVariant);
}

export async function listAllBlockVariants(): Promise<Record<string, QuoteBlockVariant[]>> {
  await ensureLegacyMigrated();
  const rows = await prisma.quoteTextVariant.findMany({
    where: { blockKey: { in: [...VARIANT_BLOCK_KEYS] }, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const out: Record<string, QuoteBlockVariant[]> = {};
  for (const row of rows) (out[row.blockKey] ??= []).push(toVariant(row));
  return out;
}

/** Cuerpo de una versión; si no existe (o slug vacío = general), el texto general. */
export async function resolveBlockVariantBody(blockKey: string, variantSlug: string | null | undefined, generalBody: string) {
  if (!variantSlug) return generalBody;
  await ensureLegacyMigrated();
  const row = await prisma.quoteTextVariant.findFirst({ where: { id: { in: variantIdsFor(blockKey, variantSlug) }, blockKey, isActive: true } });
  return row?.body || generalBody;
}
