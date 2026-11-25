/**
 * «Activá tus descuentos»: el cliente con condiciones comerciales propias
 * (reglas de margen o descuento cargadas para su empresa) ve por defecto los
 * precios de LISTA y elige ver los de sus condiciones. Sin condiciones propias
 * no hay control y se ve el precio de lista como siempre.
 *
 * No cambia cómo se calcula ningún precio: solo con qué cliente se pide el
 * cálculo (null = lista general; el id de su empresa = con sus condiciones).
 * Sin base de datos: funciones puras para poder probarlas.
 */

export const CONDITIONS_COOKIE = "st_condiciones";
/** Un año: la elección se recuerda en este navegador. */
export const CONDITIONS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** ¿Alguno de los productos le da distinto con sus condiciones que con la lista? (centavo de tolerancia). */
export function pricesDiffer(list: Map<string, { finalPriceUsd: number }>, withConditions: Map<string, { finalPriceUsd: number }>): boolean {
  for (const [id, client] of withConditions) {
    const base = list.get(id);
    if (!base) continue;
    if (Math.abs(base.finalPriceUsd - client.finalPriceUsd) >= 0.005) return true;
  }
  return false;
}

export interface ConditionsView {
  /** Mostrar el control «Activá tus descuentos». */
  offerToggle: boolean;
  /** Precios con las condiciones de la empresa (true) o de lista (false). */
  conditionsOn: boolean;
  /** Con qué cliente se calcula el precio que se muestra (null = lista). */
  priceClientId: string | null;
}

/**
 * Qué precio ve este usuario. El cookie guarda el id del usuario que activó sus
 * condiciones en este navegador: otro usuario en la misma PC no las hereda.
 */
export function resolveConditionsView(input: { clientId: string | null; hasOwnConditions: boolean; cookieValue: string | undefined; userId: string }): ConditionsView {
  if (!input.clientId || !input.hasOwnConditions) {
    return { offerToggle: false, conditionsOn: false, priceClientId: input.clientId };
  }
  const on = input.cookieValue === input.userId;
  return { offerToggle: true, conditionsOn: on, priceClientId: on ? input.clientId : null };
}
