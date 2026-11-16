/**
 * Índice de transmisión del habla (STI) por el método indirecto de la
 * función de transferencia de modulación (MTF), según Houtgast-Steeneken e
 * IEC 60268-16:2020 (anexo de cálculo a partir de parámetros de sala).
 *
 * Por banda de octava k (125 Hz – 8 kHz) y frecuencia de modulación F
 * (14 tercios de octava, 0,63 – 12,5 Hz):
 *
 *   m_rev(F) = 1 / √(1 + (2π·F·T_k / 13,8)²)                (reverberación, decaimiento exponencial)
 *   m_k(F)   = (I_dir + I_rev·m_rev(F)) / (I_dir + I_rev)     (el sonido directo no pierde modulación)
 *            · I_señal / (I_señal + I_ruido)                    (ruido de fondo)
 *            · I_total / (I_total + I_enmasc + I_umbral)        (enmascaramiento auditivo y umbral)
 *   SNR_ef   = 10·log10(m / (1 − m)), recortado a ±15 dB;  TI = (SNR_ef + 15) / 30
 *   MTI_k    = promedio de los 14 TI
 *   STI      = Σ α_k·MTI_k − Σ β_k·√(MTI_k·MTI_k+1)   (pesos de voz masculina, IEC 60268-16)
 *
 * Simplificaciones (documentadas en la lámina): enmascaramiento solo de la
 * banda inferior con la pendiente dependiente del nivel de la norma; campo
 * reverberante difuso ideal (Eyring); espectro de voz masculina normalizado;
 * sin efecto de ecos tardíos ni de la respuesta en frecuencia del parlante.
 */

import { BANDS } from "./materials";

/** Frecuencias de modulación (Hz). */
export const MOD_FREQS = [0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 12.5] as const;
/** Pesos de voz masculina (IEC 60268-16:2011/2020), 125 Hz – 8 kHz. */
export const STI_ALPHA = [0.085, 0.127, 0.23, 0.233, 0.309, 0.224, 0.173] as const;
export const STI_BETA = [0.085, 0.078, 0.065, 0.011, 0.047, 0.095] as const;
/** Espectro de voz masculina: nivel de cada banda relativo al nivel A total (dB). */
export const SPEECH_SPECTRUM = [2.9, 2.9, -0.8, -6.8, -12.8, -18.8, -24.8] as const;
/** Umbral absoluto de recepción por banda (dB). */
export const RECEPTION_THRESHOLD = [46, 27, 12, 6.5, 7.5, 8, 12] as const;

const I = (db: number) => 10 ** (db / 10);

/** Factor de enmascaramiento auditivo (dB) de una banda sobre la siguiente, según su nivel. */
export function maskingDb(level: number): number {
  if (level < 63) return 0.5 * level - 65;
  if (level < 67) return 1.8 * level - 146.9;
  if (level < 100) return 0.5 * level - 59.8;
  return -10;
}

/** MTF de un campo reverberante difuso ideal. */
export const mtfReverb = (f: number, rt60: number) => 1 / Math.sqrt(1 + ((2 * Math.PI * f * rt60) / 13.8) ** 2);

/** Índice de transmisión de un valor de modulación. */
export function transmissionIndex(m: number): number {
  const mm = Math.min(0.99999, Math.max(1e-5, m));
  const snr = Math.max(-15, Math.min(15, 10 * Math.log10(mm / (1 - mm))));
  return (snr + 15) / 30;
}

export type StiBandInput = {
  /** Nivel de la voz en la banda en el punto (dB, directo + reverberante). */
  speechDb: number;
  /** Parte directa sobre el total de la voz (0..1). */
  directRatio: number;
  rt60: number;
  noiseDb: number;
};

/** STI de un punto a partir de las 7 bandas (125 Hz – 8 kHz). */
export function stiFromBands(bands: StiBandInput[]): number {
  if (bands.length !== BANDS.length) throw new Error("El STI necesita las 7 bandas de 125 Hz a 8 kHz");
  const totals = bands.map((b) => I(b.speechDb) + I(b.noiseDb));
  const mti = bands.map((b, k) => {
    const sig = I(b.speechDb);
    const tot = totals[k]!;
    const am = k > 0 ? totals[k - 1]! * I(maskingDb(10 * Math.log10(totals[k - 1]!))) : 0;
    const rt = I(RECEPTION_THRESHOLD[k]!);
    const noise = sig / tot;
    const mask = tot / (tot + am + rt);
    const d = Math.min(1, Math.max(0, b.directRatio));
    const sum = MOD_FREQS.reduce((s, f) => s + transmissionIndex((d + (1 - d) * mtfReverb(f, b.rt60)) * noise * mask), 0);
    return sum / MOD_FREQS.length;
  });
  let sti = 0;
  for (let k = 0; k < mti.length; k++) sti += STI_ALPHA[k]! * mti[k]!;
  for (let k = 0; k < mti.length - 1; k++) sti -= STI_BETA[k]! * Math.sqrt(mti[k]! * mti[k + 1]!);
  return Math.min(1, Math.max(0, sti));
}

/** Calificación del STI (IEC 60268-16, anexo F). */
export function stiRating(sti: number): string {
  if (sti >= 0.75) return "excelente";
  if (sti >= 0.6) return "buena";
  if (sti >= 0.45) return "regular";
  if (sti >= 0.3) return "pobre";
  return "mala";
}
