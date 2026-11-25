import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BRAND_GROUPS,
  brandKey,
  buildBarEntries,
  packMenuRows,
  parseBrandGroups,
  resolveBrandGroups,
  validateBrandGroups,
  type BrandGroupsConfig,
  type LayoutCell,
} from "./brand-layout";

type B = { id: string; name: string; slug?: string };
const b = (id: string, name: string, slug?: string): B => ({ id, name, slug });
const names = (cells: LayoutCell<B>[]) => cells.map((c) => (c.type === "brand" ? c.brand.name : `soon:${c.name}`));

const REAL = [
  "Atlona", "BLAZE BY SONANCE", "Bluesound Professional", "BrightSign", "Captivate", "Crestron", "Crestron Home", "Dante",
  "FlatPanel Audio", "Gain Audio", "Hall Tech", "IPORT", "Induction Dynamics", "JAMES", "Javelin", "Phase Technology",
  "Rockustics", "SONANCE", "SolidDrive", "SoundTube", "Soundsphere", "TRUFIG", "dARTS",
].map((n, i) => b(String(i), n));

describe("brandKey", () => {
  it("ignora mayúsculas, espacios, guiones y acentos", () => {
    assert.equal(brandKey("BLAZE BY SONANCE"), brandKey("blaze-by-sonance"));
    assert.equal(brandKey("Énfasis"), "enfasis");
  });
});

describe("parseBrandGroups", () => {
  it("vacío o roto: el boceto por defecto", () => {
    assert.equal(parseBrandGroups(""), DEFAULT_BRAND_GROUPS);
    assert.equal(parseBrandGroups("{no es json"), DEFAULT_BRAND_GROUPS);
    assert.equal(parseBrandGroups(JSON.stringify({ groups: [{ brands: [] }] })), DEFAULT_BRAND_GROUPS);
  });
  it("lee grupos válidos", () => {
    const config: BrandGroupsConfig = { groups: [{ brands: ["James"] }, { brands: ["Crestron", "Crestron Home"], separate: true }] };
    assert.deepEqual(parseBrandGroups(JSON.stringify(config)), config);
  });
  it("lee el formato anterior de filas: cada caja pasa a ser un grupo", () => {
    const legacy = { rows: [[{ kind: "pair", brands: ["A", "B"] }, { kind: "single", brands: ["C"] }]] };
    assert.deepEqual(parseBrandGroups(JSON.stringify(legacy)).groups.map((g) => g.brands), [["A", "B"], ["C"]]);
  });
  it("valida grupos sin marcas", () => {
    assert.equal(validateBrandGroups({ groups: [{ brands: [] }] }).ok, false);
    assert.equal(validateBrandGroups({ groups: [{ brands: ["X"] }] }).ok, true);
  });
});

describe("resolveBrandGroups", () => {
  const config: BrandGroupsConfig = {
    groups: [
      { brands: ["Crestron", "Crestron Home"], separate: true },
      { brands: ["SoundTube", "Phase Technology", "dARTS"] },
      { brands: ["James"] },
      { brands: ["Yamaha"] },
      { brands: ["Hidden Brand"] },
    ],
  };
  const brands = [b("c", "Crestron"), b("crestron-home", "Crestron Home"), b("p", "Phase Technology"), b("d", "dARTS"), b("j", "JAMES"), b("x", "Extra Uno"), b("y", "Extra Dos")];
  const known = [...brands.map((x) => x.name), "SoundTube", "Hidden Brand"];
  const resolved = resolveBrandGroups(config, brands, known);

  it("respeta el orden de los grupos y de las marcas", () => {
    assert.deepEqual(resolved.groups.map((g) => names(g.cells)), [["Crestron", "Crestron Home"], ["Phase Technology", "dARTS"], ["JAMES"], ["soon:Yamaha"]]);
  });
  it("grupo sin su principal: la siguiente marca pasa a encabezarlo", () => {
    assert.equal(names(resolved.groups[1].cells)[0], "Phase Technology");
  });
  it("no existe en la base: «Próximamente»; existe pero no se ve: no aparece", () => {
    assert.ok(resolved.groups.some((g) => names(g.cells).includes("soon:Yamaha")));
    assert.ok(!resolved.groups.some((g) => names(g.cells).some((n) => n.includes("Hidden"))));
  });
  it("las marcas que ningún grupo nombra van a «Más marcas», en el orden recibido", () => {
    assert.deepEqual(resolved.extras.map((x) => x.name), ["Extra Uno", "Extra Dos"]);
  });
  it("una marca repetida aparece una sola vez", () => {
    const r = resolveBrandGroups({ groups: [{ brands: ["James"] }, { brands: ["JAMES"] }] }, [b("j", "JAMES")], ["JAMES"]);
    assert.equal(r.groups.length, 1);
    assert.equal(r.extras.length, 0);
  });
});

describe("menú de marcas (boceto)", () => {
  const rows = packMenuRows(resolveBrandGroups(DEFAULT_BRAND_GROUPS, REAL, REAL.map((x) => x.name)).groups);
  it("arma las 6 filas del boceto", () => {
    assert.deepEqual(rows.map((row) => row.map((box) => box.kind)), [
      ["pair", "pair"],
      ["group"],
      ["group"],
      ["single", "single", "single"],
      ["single", "single", "single"],
      ["single", "single", "single"],
    ]);
    assert.deepEqual(names(rows[0][0].cells), ["Crestron", "Crestron Home"]);
    assert.deepEqual(names(rows[5].flatMap((box) => box.cells)), ["FlatPanel Audio", "soon:Work Pro", "soon:Yamaha"]);
  });
  it("con las marcas de prueba no queda ninguna en «Más marcas»", () => {
    assert.equal(resolveBrandGroups(DEFAULT_BRAND_GROUPS, REAL, REAL.map((x) => x.name)).extras.length, 0);
  });
});

describe("barra de marcas", () => {
  const entries = buildBarEntries(resolveBrandGroups(DEFAULT_BRAND_GROUPS, [...REAL, b("z", "Zeta")], REAL.map((x) => x.name)));
  const label = (e: (typeof entries)[number]) => (e.type === "family" ? `${e.lead.name}+${e.members.length - 1}` : e.type === "brand" ? e.brand.name : `soon:${e.name}`);
  it("solo la principal de cada grupo; Crestron y Crestron Home siempre separadas; las sueltas al final", () => {
    assert.deepEqual(entries.map(label), [
      "Crestron", "Crestron Home", "SONANCE+1", "SoundTube+6", "Atlona+4", "JAMES", "TRUFIG", "IPORT",
      "Bluesound Professional", "BrightSign", "Dante", "FlatPanel Audio", "soon:Work Pro", "soon:Yamaha", "Zeta",
    ]);
  });
  it("la familia trae a la principal primero y después sus hermanas", () => {
    const st = entries.find((e) => e.type === "family" && e.lead.name === "SoundTube");
    assert.ok(st && st.type === "family");
    assert.deepEqual(names(st.members), ["SoundTube", "Phase Technology", "Rockustics", "SolidDrive", "Soundsphere", "dARTS", "Induction Dynamics"]);
  });
});
