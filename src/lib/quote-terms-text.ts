/**
 * El módulo «Condiciones comerciales» es un texto fijo con apartados en
 * mayúsculas (FORMA DE PAGO, MANTENIMIENTO DE LA OFERTA…). Traía valores
 * escritos a mano («A CONVENIR», «cinco (5) días») que contradecían lo que se
 * configura en la cotización. Al armar el documento, cada apartado que tiene
 * un dato cargado se reemplaza por ese dato; el resto del texto queda igual.
 */

export type CommercialTermsValues = {
  paymentTerms?: string | null;
  paymentReference?: string | null;
  deliveryText?: string | null;
  validityDays?: number | null;
};

const HEADING = /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ./()-]{2,}$/;

function replacementFor(heading: string, terms: CommercialTermsValues): string | null {
  const key = heading.trim().toUpperCase();
  if (key === "FORMA DE PAGO" && terms.paymentTerms?.trim()) {
    return `Para la presente propuesta comercial se ha considerado la siguiente condición de pago: ${terms.paymentTerms.trim().replace(/\.$/, "")}.`;
  }
  if (key === "REFERENCIA DE PAGO" && terms.paymentReference?.trim()) return terms.paymentReference.trim();
  if (key === "MANTENIMIENTO DE LA OFERTA" && terms.validityDays && terms.validityDays > 0) {
    const n = terms.validityDays;
    return `La presente oferta se mantiene vigente por un período de ${n} ${n === 1 ? "día corrido" : "días corridos"} a partir de la fecha de emisión, para los valores indicados.`;
  }
  if (key === "PLAZO DE ENTREGA" && terms.deliveryText?.trim()) return terms.deliveryText.trim();
  return null;
}

export function alignCommercialTermsText(body: string, terms: CommercialTermsValues | null | undefined): string {
  if (!terms || !body.trim()) return body;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    out.push(line);
    i++;
    if (!HEADING.test(line.trim())) continue;
    const replacement = replacementFor(line, terms);
    if (replacement == null) continue;
    // Se saltea el texto del apartado (hasta el próximo encabezado) y va el dato cargado.
    while (i < lines.length && !HEADING.test(lines[i]!.trim())) i++;
    out.push(replacement, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
