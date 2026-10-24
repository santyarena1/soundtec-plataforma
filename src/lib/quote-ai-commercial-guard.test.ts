import { test } from "node:test";
import assert from "node:assert/strict";
import { asksForCommercialChange, newCommercialClaims } from "./quote-ai-commercial-guard";

test("bloquea instrucciones que ponen condiciones comerciales", () => {
  assert.ok(asksForCommercialChange("agregá 3 años de garantía y soporte 24/7"));
  assert.ok(asksForCommercialChange("poné 30% de anticipo y saldo a 60 días"));
  assert.ok(asksForCommercialChange("ofrecé un descuento del 10%"));
  assert.ok(asksForCommercialChange("sumá mantenimiento sin cargo el primer año"));
  assert.ok(asksForCommercialChange("cambiá la vigencia de la oferta"));
});

test("deja pasar instrucciones de redacción", () => {
  assert.equal(asksForCommercialChange("más corto"), null);
  assert.equal(asksForCommercialChange("más formal y con viñetas"), null);
  assert.equal(asksForCommercialChange("redactá mejor la garantía, más clara"), null);
  assert.equal(asksForCommercialChange("mencioná la sala de 40 personas"), null);
});

test("detecta condiciones nuevas en el texto que devolvió la IA", () => {
  const source = "<p>Garantía de 12 meses contra defectos de fabricación.</p>";
  assert.deepEqual(newCommercialClaims(source, "<p>Garantía de 12 meses contra defectos.</p>"), []);
  assert.deepEqual(newCommercialClaims(source, "<p>Garantía de 3 años y soporte 24/7.</p>"), ["3 anos", "24/7"]);
});

test("no confunde especificaciones técnicas con condiciones", () => {
  assert.deepEqual(newCommercialClaims("", "Cobertura de 360° y respuesta de 40 Hz a 20 kHz, humedad hasta 90%."), []);
  assert.deepEqual(newCommercialClaims("", "La entrega se coordina con el cliente."), []);
});
