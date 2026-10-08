import type { DesignRole, MountOption, RankCandidate, RankResult, RankSortMode } from "./types";

export type SlotRequirements = {
  role: DesignRole;
  mount: MountOption;
  /** Si true, exige coverageFit no null para rankear alto en modo coverage */
  prefersCoverage?: boolean;
};

/** Hard filter: ¿puede ir en este slot? */
export function isCompatibleWithSlot(
  candidate: RankCandidate,
  slot: SlotRequirements,
): { ok: true } | { ok: false; reason: string } {
  if (candidate.discontinued) {
    return { ok: false, reason: "Producto discontinuado" };
  }
  if (!candidate.designRole) {
    return { ok: false, reason: "Sin rol de diseño" };
  }
  if (candidate.designRole !== slot.role) {
    return { ok: false, reason: `Rol incompatible (slot ${slot.role})` };
  }
  if (
    candidate.mountOptions.length > 0 &&
    !candidate.mountOptions.includes(slot.mount)
  ) {
    return { ok: false, reason: `Montaje incompatible (requiere ${slot.mount})` };
  }
  return { ok: true };
}

/**
 * Score compuesto 0..100. Sin defaults flojos: los pesos están explícitos
 * y coverage ausente no inventa puntos de alcance.
 */
export function scoreCandidate(
  candidate: RankCandidate,
  mode: RankSortMode = "recommended",
): number {
  if (mode === "price_asc") {
    if (candidate.priceUsd == null) return 0;
    // Menor precio = mayor score relativo (se reordena luego)
    return 1 / (1 + candidate.priceUsd);
  }
  if (mode === "coverage") {
    return (candidate.coverageFit ?? 0) * 100;
  }
  if (mode === "stock") {
    return candidate.stockScore * 100;
  }
  if (mode === "premium") {
    const price = candidate.priceUsd ?? 0;
    return Math.min(100, price / 50 + candidate.brandBoost * 20 + candidate.typologyFit * 30);
  }

  // recommended: equilibrado precio + cobertura + tipología + stock + datos
  const priceScore =
    candidate.priceUsd == null
      ? 0.35
      : clamp(1 - Math.log10(Math.max(candidate.priceUsd, 10)) / 4, 0.1, 1);

  const coverageScore =
    candidate.coverageFit == null ? 0.45 : candidate.coverageFit; // neutro si no hay dato

  const raw =
    coverageScore * 0.32 +
    priceScore * 0.28 +
    candidate.typologyFit * 0.18 +
    candidate.stockScore * 0.12 +
    candidate.dataCompleteness * 0.07 +
    candidate.brandBoost * 0.03;

  return Math.round(clamp(raw, 0, 1) * 1000) / 10;
}

export function rankForSlot(
  candidates: RankCandidate[],
  slot: SlotRequirements,
  mode: RankSortMode = "recommended",
): RankResult[] {
  const results: RankResult[] = [];

  for (const c of candidates) {
    const gate = isCompatibleWithSlot(c, slot);
    if (!gate.ok) {
      results.push({
        ...c,
        compatible: false,
        hardRejectReason: gate.reason,
        score: -1,
      });
      continue;
    }
    results.push({
      ...c,
      compatible: true,
      score: scoreCandidate(c, mode),
    });
  }

  const compatible = results.filter((r) => r.compatible);
  const rejected = results.filter((r) => !r.compatible);

  if (mode === "price_asc") {
    compatible.sort((a, b) => {
      const pa = a.priceUsd ?? Number.POSITIVE_INFINITY;
      const pb = b.priceUsd ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    });
  } else {
    compatible.sort((a, b) => b.score - a.score);
  }

  return [...compatible, ...rejected];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
