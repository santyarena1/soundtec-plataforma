import { test } from "node:test";
import assert from "node:assert/strict";
import { alignCommercialTermsText } from "./quote-terms-text";

const BODY = `PRECIO
Los precios detallados en esta propuesta están expresados en dólares estadounidenses y no incluyen IVA.

FORMA DE PAGO
Para la presente propuesta comercial se ha considerado la siguiente condición de pago: A CONVENIR.

MANTENIMIENTO DE LA OFERTA
La presente oferta se mantiene vigente por un período de cinco (5) días corridos a partir de la fecha de emisión, para los valores indicados.

PLAZO DE ENTREGA
El plazo de entrega será confirmado una vez recibida la orden de compra formal.`;

test("usa la forma de pago y la vigencia cargadas en la cotización", () => {
  const out = alignCommercialTermsText(BODY, { paymentTerms: "50% anticipo, 50% contra entrega", validityDays: 10 });
  assert.match(out, /condición de pago: 50% anticipo, 50% contra entrega\./);
  assert.match(out, /período de 10 días corridos/);
  assert.doesNotMatch(out, /A CONVENIR|cinco \(5\)/);
  // Lo que no tiene dato cargado queda como estaba.
  assert.match(out, /PRECIO\nLos precios detallados/);
  assert.match(out, /PLAZO DE ENTREGA\nEl plazo de entrega será confirmado/);
});

test("el plazo de entrega cargado reemplaza el texto genérico", () => {
  const out = alignCommercialTermsText(BODY, { deliveryText: "15 días hábiles" });
  assert.match(out, /PLAZO DE ENTREGA\n15 días hábiles$/);
});

test("sin condiciones cargadas el texto no cambia", () => {
  assert.equal(alignCommercialTermsText(BODY, null), BODY);
  assert.equal(alignCommercialTermsText(BODY, {}), BODY);
});

test("un día en singular", () => {
  assert.match(alignCommercialTermsText(BODY, { validityDays: 1 }), /período de 1 día corrido a partir/);
});
