/**
 * Redondeo del precio de venta por tramos (Configuración › Precios).
 *
 * Cómo funciona:
 *  - Se elige el tramo por el precio sin redondear: el primero (ordenados por
 *    «hasta») cuyo «hasta» es mayor o igual al precio. Un precio por encima del
 *    último tramo no se redondea.
 *  - Paso 0 = sin redondeo en ese tramo.
 *  - Modo «arriba»: sube al próximo múltiplo del paso (79,62 con paso 0,25 → 79,75).
 *    Modo «más cercano»: va al múltiplo más cercano (79,62 → 79,50).
 *  - Se aplica en UN solo lugar (src/lib/pricing.ts) al precio de lista y al
 *    final de venta en USD; el resto de la cadena (ARS, cotizaciones, PDF,
 *    listas, exportaciones) parte de esos valores.
 */
import { z } from "zod";

export type RoundingMode = "up" | "nearest";

export interface PriceRoundingTier {
  /** Desde (USD), solo informativo: el tramo se elige por «hasta». */
  fromUsd: number;
  /** Hasta (USD), inclusive. */
  toUsd: number;
  /** Múltiplo al que se redondea. 0 = sin redondeo. */
  step: number;
}

export interface PriceRoundingConfig {
  enabled: boolean;
  mode: RoundingMode;
  tiers: PriceRoundingTier[];
}

/** Clave del redondeo vigente (lo que usan los precios). Solo cambia al aplicar una revisión. */
export const ROUNDING_SETTING_KEY = "pricing.rounding";
/** Clave del borrador que se edita en la pantalla (no mueve precios). */
export const ROUNDING_DRAFT_SETTING_KEY = "pricing.rounding.draft";

export const DEFAULT_ROUNDING_TIERS: PriceRoundingTier[] = [
  { fromUsd: 0, toUsd: 10, step: 0 },
  { fromUsd: 10.01, toUsd: 50, step: 0.05 },
  { fromUsd: 50.01, toUsd: 100, step: 0.1 },
  { fromUsd: 100.01, toUsd: 300, step: 0.25 },
  { fromUsd: 300.01, toUsd: 1000, step: 0.5 },
  { fromUsd: 1000.01, toUsd: 50000, step: 1 },
];

export const DEFAULT_ROUNDING: PriceRoundingConfig = { enabled: false, mode: "up", tiers: DEFAULT_ROUNDING_TIERS };

const tierSchema = z.object({
  fromUsd: z.coerce.number().min(0).max(10_000_000),
  toUsd: z.coerce.number().min(0).max(10_000_000),
  step: z.coerce.number().min(0).max(100_000),
});

const configSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["up", "nearest"]),
  tiers: z.array(tierSchema).max(30),
});

export type RoundingValidation = { ok: true; config: PriceRoundingConfig } | { ok: false; error: string };

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

/** Valida y ordena los tramos. Sin solapamientos y con «hasta» mayor que «desde». */
export function validateRoundingConfig(input: unknown): RoundingValidation {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los tramos: cada uno necesita desde, hasta y paso (números positivos)." };
  const tiers = [...parsed.data.tiers].sort((a, b) => a.toUsd - b.toUsd);
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    if (tier.toUsd <= tier.fromUsd) return { ok: false, error: `El tramo que termina en ${fmt(tier.toUsd)} tiene «hasta» menor o igual que «desde».` };
    const prev = tiers[i - 1];
    if (prev && tier.fromUsd <= prev.toUsd) {
      return { ok: false, error: `Los tramos ${fmt(prev.fromUsd)}–${fmt(prev.toUsd)} y ${fmt(tier.fromUsd)}–${fmt(tier.toUsd)} se superponen.` };
    }
  }
  return { ok: true, config: { ...parsed.data, tiers } };
}

/** Lee la configuración guardada (JSON). Si está vacía o rota, devuelve null (sin redondeo). */
export function parseRoundingSetting(raw: string | null | undefined): PriceRoundingConfig | null {
  if (!raw || !raw.trim()) return null;
  try {
    const result = validateRoundingConfig(JSON.parse(raw));
    return result.ok ? result.config : null;
  } catch {
    return null;
  }
}

/** Tramo que corresponde a un precio (o null si queda fuera de todos). */
export function tierFor(price: number, tiers: readonly PriceRoundingTier[]): PriceRoundingTier | null {
  const sorted = [...tiers].sort((a, b) => a.toUsd - b.toUsd);
  return sorted.find((tier) => price <= tier.toUsd + 1e-9) ?? null;
}

/** Redondea un precio en USD según la configuración. Desactivado o sin tramo: queda igual. */
export function roundPrice(price: number, config: PriceRoundingConfig | null | undefined): number {
  if (!config?.enabled || !Number.isFinite(price) || price <= 0) return price;
  const tier = tierFor(price, config.tiers);
  if (!tier || !(tier.step > 0)) return price;
  // Se trabaja en milésimos de centavo para que 0,1 + 0,2 no dé 0,30000000000000004.
  const scale = 100_000;
  const units = Math.round(price * scale);
  const stepUnits = Math.round(tier.step * scale);
  if (stepUnits <= 0) return price;
  const remainder = units % stepUnits;
  if (remainder === 0) return units / scale;
  const down = units - remainder;
  const rounded = config.mode === "nearest" && remainder * 2 < stepUnits ? down : down + stepUnits;
  return Math.round(rounded) / scale;
}

/** Texto de ejemplo para la pantalla: «79,62 → 79,75». */
export function roundingExample(price: number, config: PriceRoundingConfig): string {
  const rounded = roundPrice(price, { ...config, enabled: true });
  return `US$ ${fmt(price)} → US$ ${fmt(rounded)}`;
}
