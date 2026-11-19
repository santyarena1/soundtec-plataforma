/**
 * «Para llamar»: clientes que se están moviendo en el portal (miran fichas,
 * guardan favoritos, le preguntan a Soundtec AI, buscan, entran) y no tienen
 * una cotización abierta. Es la lista para levantar el teléfono.
 * Puro: las señales las junta el servidor; acá solo se puntúa y se explica.
 */

export type ClientSignals = {
  clientId: string;
  companyName: string;
  ownerName?: string | null;
  /** Fichas distintas vistas en la ventana. */
  productsViewed: number;
  favoritesAdded: number;
  aiQuestions: number;
  searches: number;
  lastLoginAt: Date | null;
  /** Borrador, en revisión, lista, o con PDF todavía vigente. */
  hasOpenQuote: boolean;
};

export type CallCandidate = ClientSignals & { score: number; reasons: string[] };

/** Peso de cada señal: guardar un favorito o preguntar dice más que mirar. */
export const CALL_WEIGHTS = { productViewed: 1, favorite: 3, aiQuestion: 2, search: 0.5, recentLogin: 2 } as const;
/** Puntaje mínimo para entrar en la lista (p. ej. 5 fichas, o 1 favorito y 1 pregunta). */
export const CALL_MIN_SCORE = 5;
/** Una visita cuenta si fue en los últimos 7 días. */
export const RECENT_LOGIN_MS = 7 * 86_400_000;

export function callScore(s: ClientSignals, now: Date): number {
  const recent = s.lastLoginAt && now.getTime() - s.lastLoginAt.getTime() <= RECENT_LOGIN_MS ? 1 : 0;
  return (
    s.productsViewed * CALL_WEIGHTS.productViewed +
    s.favoritesAdded * CALL_WEIGHTS.favorite +
    s.aiQuestions * CALL_WEIGHTS.aiQuestion +
    s.searches * CALL_WEIGHTS.search +
    recent * CALL_WEIGHTS.recentLogin
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Por qué está en la lista, en el orden en que conviene leerlo. */
export function callReasons(s: ClientSignals, now: Date): string[] {
  const out: string[] = [];
  if (s.favoritesAdded) out.push(`guardó ${plural(s.favoritesAdded, "favorito", "favoritos")}`);
  if (s.aiQuestions) out.push(`hizo ${plural(s.aiQuestions, "pregunta", "preguntas")} a Soundtec AI`);
  if (s.productsViewed) out.push(`miró ${plural(s.productsViewed, "ficha", "fichas")}`);
  if (s.searches) out.push(`buscó ${plural(s.searches, "vez", "veces")}`);
  if (s.lastLoginAt) {
    const days = Math.floor((now.getTime() - s.lastLoginAt.getTime()) / 86_400_000);
    if (days <= 7) out.push(days === 0 ? "entró hoy" : days === 1 ? "entró ayer" : `entró hace ${days} días`);
  }
  return out;
}

/** Ordena de más a menos movimiento; sin cotización abierta y sobre el mínimo. */
export function rankCallList(signals: ClientSignals[], now: Date = new Date(), limit = 8): CallCandidate[] {
  return signals
    .filter((s) => !s.hasOpenQuote)
    .map((s) => ({ ...s, score: callScore(s, now), reasons: callReasons(s, now) }))
    .filter((c) => c.score >= CALL_MIN_SCORE)
    .sort((a, b) => b.score - a.score || (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0) || a.companyName.localeCompare(b.companyName, "es"))
    .slice(0, limit);
}
