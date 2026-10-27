/**
 * Las condiciones comerciales (garantía, pagos, plazos, vigencia, descuentos,
 * soporte) NO las cambia la IA: salen de Configuración → Cotizaciones → Pago,
 * entrega y garantía, o del paso «Condiciones y PDF» de cada cotización. Decisión del
 * negocio (2026-10-25): una instrucción a la IA no puede prometer otra cosa.
 */

export const COMMERCIAL_BLOCK_MESSAGE =
  "Las condiciones comerciales (garantía, pagos, plazos, vigencia, descuentos, soporte) no se cambian con la IA. Se definen en Configuración → Cotizaciones → Pago, entrega y garantía, o en el paso «Condiciones y PDF» de la cotización.";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

const TOPIC = "(garantia|soporte|asistencia|servicio tecnico|mantenimiento|entrega|pago|anticipo|saldo|cuota|vigencia|validez|plazo|descuento|bonificacion|financiacion|contado|precio|iva|tipo de cambio|dolar|devolucion|reembolso)";

/** Valores comerciales concretos: «3 años», «60 días», «10%», «24/7», «sin cargo»… */
const VALUE = /(\d+(?:[.,]\d+)?\s*(?:anos?|meses|mes|dias(?: habiles| corridos)?|semanas?|%|cuotas?)|\b24\s*\/\s*7\b|\b24\s*x\s*7\b|sin cargo|sin costo|gratis|bonificad[oa]s?|de por vida|ilimitad[oa]s?)/g;

/** ¿La instrucción pide poner o cambiar una condición comercial? Devuelve lo que la delata. */
export function asksForCommercialChange(instruction: string): string | null {
  const text = fold(instruction);
  if (!new RegExp(TOPIC).test(text)) return null;
  const value = text.match(VALUE)?.[0];
  if (value) return value.trim();
  const verb = text.match(new RegExp(`(agrega|pone|cambia|modifica|extende|amplia|ofrece|suma|inclui|quita|saca|elimina)\\w*[^.]{0,40}${TOPIC}`));
  return verb ? verb[0].trim() : null;
}

/**
 * Condiciones comerciales que aparecen en `output` y no estaban en `source`:
 * un valor concreto a menos de 60 caracteres de un tema comercial.
 */
export function newCommercialClaims(source: string, output: string): string[] {
  const src = fold(source);
  const out = fold(output);
  const topic = new RegExp(TOPIC, "g");
  const claims = new Set<string>();
  for (const match of out.matchAll(VALUE)) {
    const value = match[0].trim();
    if (src.includes(value)) continue;
    const at = match.index ?? 0;
    const around = out.slice(Math.max(0, at - 60), at + value.length + 60);
    topic.lastIndex = 0;
    if (topic.test(around)) claims.add(value);
  }
  return [...claims];
}
