/**
 * Variantes de texto para módulos fijos (ej. Disciplinas).
 * Se guardan en adminSetting como JSON hasta tener tabla dedicada.
 */

import { getSetting, setSetting } from "@/lib/settings";

export type QuoteBlockVariant = {
  slug: string;
  label: string;
  body: string;
  isDefault?: boolean;
};

const keyFor = (blockKey: string) => `quotes.block_variants.${blockKey}`;

export async function listBlockVariants(blockKey: string): Promise<QuoteBlockVariant[]> {
  const raw = await getSetting(keyFor(blockKey), "[]");
  try {
    const parsed = JSON.parse(raw) as QuoteBlockVariant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveBlockVariants(blockKey: string, variants: QuoteBlockVariant[]) {
  await setSetting(keyFor(blockKey), JSON.stringify(variants), {
    description: `Variantes del módulo ${blockKey}`,
  });
}

export const VARIANT_BLOCK_KEYS = ["disciplines", "corporate_intro", "installation"] as const;

export type VariantBlockKey = (typeof VARIANT_BLOCK_KEYS)[number];

export function isVariantBlockKey(key: string): key is VariantBlockKey {
  return (VARIANT_BLOCK_KEYS as readonly string[]).includes(key);
}

export async function defaultBlockVariantBody(blockKey: string, fallback: string) {
  const variants = await listBlockVariants(blockKey);
  const chosen = variants.find((v) => v.isDefault) || variants[0];
  return chosen?.body || fallback;
}

export async function resolveBlockVariantBody(blockKey: string, variantSlug: string | null | undefined, fallback: string) {
  if (!variantSlug) return defaultBlockVariantBody(blockKey, fallback);
  const variants = await listBlockVariants(blockKey);
  const match = variants.find((v) => v.slug === variantSlug);
  return match?.body || defaultBlockVariantBody(blockKey, fallback);
}
