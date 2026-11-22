import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanRawProductLine,
  crestronSeriesFromPath,
  detectProductSeries,
  normalizeSeriesName,
  seriesFromModelPrefix,
  seriesSlug,
  sonanceSeriesCandidates,
} from "./detect";

const meta = (...cats: string[]) => ({
  attributeTypes: [{ name: "Product Category", attributeValues: cats.map((value) => ({ value })) }],
});

describe("normalizeSeriesName", () => {
  it("saca «Series»/«Serie» y no traduce", () => {
    assert.equal(normalizeSeriesName("Landscape Series"), "Landscape");
    assert.equal(normalizeSeriesName("Serie B"), "B");
    assert.equal(normalizeSeriesName("  Visual   Performance "), "Visual Performance");
    assert.equal(normalizeSeriesName("CBL Series"), "CBL");
  });
  it("respeta mayúsculas de la marca y capitaliza solo lo que viene todo en minúscula", () => {
    assert.equal(normalizeSeriesName("DM NVX"), "DM NVX");
    assert.equal(normalizeSeriesName("horizon"), "Horizon");
  });
  it("vacío o absurdo → null", () => {
    assert.equal(normalizeSeriesName(""), null);
    assert.equal(normalizeSeriesName("Series"), null);
    assert.equal(normalizeSeriesName("x".repeat(80)), null);
  });
  it("slug estable", () => assert.equal(seriesSlug("Zūm"), "zum"));
});

describe("Crestron: ruta de crestron.com", () => {
  it("toma la serie del nivel 2", () => {
    assert.equal(crestronSeriesFromPath("Lighting and Environmental > Horizon > Keypad Buttons"), "Horizon");
    assert.equal(crestronSeriesFromPath("Lighting and Environmental > Cameo Express > Keypad Buttons"), "Cameo Express");
    assert.equal(crestronSeriesFromPath("Unified Communications > Flex Conferencing > Room Kits"), "Flex");
    assert.equal(crestronSeriesFromPath("AV Over IP > DM NVX AV Over IP > Video Endpoint"), "DM NVX");
    assert.equal(crestronSeriesFromPath("Presentation and Conferencing > AirMedia > Receiver"), "AirMedia");
  });
  it("o del nivel 3 cuando el 2 es genérico", () => {
    assert.equal(crestronSeriesFromPath("Control and Management > Keypads > Cameo Keypad"), "Cameo");
    assert.equal(crestronSeriesFromPath("Control and Management > Keypads > Horizon"), "Horizon");
  });
  it("tipos genéricos y discontinuados no dan serie", () => {
    assert.equal(crestronSeriesFromPath("Infrastructure > Fliptops > Compartment"), null);
    assert.equal(crestronSeriesFromPath("Control and Management > User Interfaces > Touchscreen"), null);
    assert.equal(crestronSeriesFromPath("Control and Management > Control System"), null);
    assert.equal(crestronSeriesFromPath("Inactive > Discontinued > Horizon"), null);
    assert.equal(crestronSeriesFromPath(null), null);
  });
});

describe("prefijo de modelo (reglas explícitas)", () => {
  it("por marca", () => {
    assert.equal(seriesFromModelPrefix("SONANCE", "VP66"), "Visual Performance");
    assert.equal(seriesFromModelPrefix("SONANCE", "VPXT6R SST"), "Visual Performance");
    assert.equal(seriesFromModelPrefix("SONANCE", "LS6T SAT"), "Landscape");
    assert.equal(seriesFromModelPrefix("JAMES", "XPC-4R-T"), "XPC");
    assert.equal(seriesFromModelPrefix("Crestron", "HZ2-KPCN-W"), "Horizon");
    assert.equal(seriesFromModelPrefix("Crestron", "DM-NAX-8ZSA"), "DM NAX");
    assert.equal(seriesFromModelPrefix("BLAZE BY SONANCE", "POWERZONE CONNECT 122"), "PowerZone");
  });
  it("no aplica la regla de otra marca ni prefijos parecidos", () => {
    assert.equal(seriesFromModelPrefix("JAMES", "VP66"), null);
    assert.equal(seriesFromModelPrefix("SONANCE", "VC60R WHITE"), null);
    assert.equal(seriesFromModelPrefix("SONANCE", "LSX"), null);
    assert.equal(seriesFromModelPrefix(null, "VP66"), null);
  });
});

describe("atributo Product Category (portal Sonance)", () => {
  it("filtra por la lista de la marca", () => {
    assert.deepEqual(sonanceSeriesCandidates("SONANCE", meta("Landscape Series")), ["Landscape"]);
    assert.deepEqual(sonanceSeriesCandidates("SONANCE", meta("Soundbar")), []);
    assert.deepEqual(sonanceSeriesCandidates("TRUFIG", meta("Visual Experience")), []);
  });
  it("Mariner y Legacy Mariner son la misma serie", () => {
    assert.deepEqual(sonanceSeriesCandidates("SONANCE", meta("Legacy Mariner", "Mariner")), ["Mariner"]);
  });
  it("un atributo «Series» explícito también vale", () => {
    const m = { attributeTypes: [{ name: "Series", attributeValues: [{ value: "Extreme Series" }] }] };
    assert.deepEqual(sonanceSeriesCandidates("SONANCE", m), ["Extreme"]);
  });
});

describe("detectProductSeries", () => {
  it("`line` manda", () => {
    const d = detectProductSeries({ brandName: "Bluesound Professional", line: "Serie B", modelNumber: "B400S" });
    assert.deepEqual(d, { kind: "series", name: "B", source: "LINE", evidence: "line=Serie B" });
  });
  it("el prefijo desempata un atributo con varias series", () => {
    const d = detectProductSeries({ brandName: "SONANCE", modelNumber: "PS-C41RT", sourceMetadata: meta("Professional Series", "Visual Experience") });
    assert.equal(d.kind === "series" && d.name, "Professional");
  });
  it("varias series sin prefijo → ambiguo (queda sin serie)", () => {
    const d = detectProductSeries({ brandName: "SONANCE", modelNumber: "LARGE ROUND FLEX BRACKET", sourceMetadata: meta("Visual Experience", "Visual Performance Series") });
    assert.equal(d.kind, "ambiguous");
  });
  it("Crestron usa la ruta, no el atributo", () => {
    const d = detectProductSeries({ brandName: "Crestron", modelNumber: "C2N-CBD", sourceCategoryPath: "Lighting and Environmental > Cameo > Dimmers" });
    assert.equal(d.kind === "series" && d.source, "CRESTRON_PATH");
  });
  it("sin fuente clara → none", () => {
    assert.equal(detectProductSeries({ brandName: "SoundTube", modelNumber: "CM62-EZ" }).kind, "none");
  });
});

describe("productLine con JSON crudo", () => {
  it("devuelve el nombre", () => assert.equal(cleanRawProductLine('{"id":"x","name":"SGS Systems"}'), "SGS Systems"));
  it("texto normal no se toca", () => assert.equal(cleanRawProductLine("In-Ceiling"), null));
});
