/**
 * Medidas físicas que trae un proveedor, depuradas de relleno.
 *
 * El portal de Sonance (Sonance, Blaze, TRUFIG, IPORT, James) devuelve
 * shippingWidth/Height/Length = 1 cuando no tiene el dato: eso dibujaba un
 * parlante de 1×1×1 cm en el plano. Regla: si todas las medidas que vienen
 * son ≤ 1 cm se toman como «sin dato» (undefined), y una medida ≤ 0 nunca
 * es real. Es preferible «sin dato» a un dato falso.
 */

export type DimensionsCm = {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
};

/** Máximo que se considera relleno cuando las tres medidas lo cumplen. */
export const PLACEHOLDER_MAX_CM = 1;

function positive(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** true si las medidas presentes son todas ≤ 1 cm (relleno del proveedor). */
export function isPlaceholderDimensions(dims: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null }): boolean {
  const values = [dims.widthCm, dims.heightCm, dims.depthCm].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  return values.length > 0 && values.every((v) => v <= PLACEHOLDER_MAX_CM);
}

/** Devuelve solo las medidas creíbles; el relleno queda como undefined. */
export function realDimensionsCm(dims: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null }): DimensionsCm {
  if (isPlaceholderDimensions(dims)) return {};
  return {
    widthCm: positive(dims.widthCm),
    heightCm: positive(dims.heightCm),
    depthCm: positive(dims.depthCm),
  };
}
