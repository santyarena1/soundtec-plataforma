import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lookupSupplierTerm, SUPPLIER_GLOSSARY, supplierTermEs } from "./supplier-glossary";

describe("glosario de términos de proveedores", () => {
  it("usa el término del rubro, no la traducción literal", () => {
    assert.equal(supplierTermEs("Grille"), "Rejilla");
    assert.equal(supplierTermEs("Speaker"), "Parlante");
    assert.equal(supplierTermEs("Soundbar"), "Barra de sonido");
    assert.equal(supplierTermEs("In-Ceiling"), "Embutido de techo");
    assert.equal(supplierTermEs("Pendant"), "Colgante");
  });

  it("lo que el rubro dice en inglés queda en inglés", () => {
    assert.deepEqual(lookupSupplierTerm("Keypad"), { es: "Keypad", status: "english" });
    assert.equal(supplierTermEs("Subwoofer"), "Subwoofer");
  });

  it("dudosos quedan en el original marcados para revisión", () => {
    assert.deepEqual(lookupSupplierTerm("Fascia"), { es: "Fascia", status: "review" });
  });

  it("desconocido: el original sin inventar", () => {
    assert.deepEqual(lookupSupplierTerm("Flexframe"), { es: "Flexframe", status: "unknown" });
    assert.equal(supplierTermEs("Flexframe"), "Flexframe");
  });

  it("compuestos con « · » y variantes de escritura", () => {
    assert.equal(supplierTermEs("Outdoor Above Ground · Surface Mount"), "Exterior sobre el suelo · De superficie");
    assert.equal(supplierTermEs("in ceiling"), "Embutido de techo");
    assert.equal(supplierTermEs("Electronica"), "Electrónica");
    assert.equal(supplierTermEs(""), null);
  });

  it("cada entrada tiene término y traducción, sin repetidos", () => {
    const keys = SUPPLIER_GLOSSARY.map((e) => e.term.toLowerCase());
    assert.equal(new Set(keys).size, keys.length);
    for (const e of SUPPLIER_GLOSSARY) assert.ok(e.es.trim() && e.term.trim());
    for (const e of SUPPLIER_GLOSSARY.filter((x) => x.status === "review")) assert.equal(e.es, e.term);
  });
});
