import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equivalenceSourceForSync,
  joinProviderPath,
  sonanceProviderPath,
  soundTubeListPath,
  uncategorizedNewNotice,
  SIN_RUBRO_HREF,
} from "./new-product-rubro";
import { equivalenceKey } from "./category-equivalence";
import {
  consistentCategoryId,
  describeProductForRubro,
  matchRubroPath,
  normalizeRubroPath,
  pathsUnder,
  secondLevelPaths,
} from "./ai-rubro-path";

test("ruta del proveedor: une con « > », saca vacíos y repetidos seguidos", () => {
  assert.equal(joinProviderPath(" In-Ceiling  Speakers ", "", null, "Accessory"), "In-Ceiling Speakers > Accessory");
  assert.equal(joinProviderPath("Accessories", "accessories"), "Accessories");
  assert.equal(joinProviderPath(undefined, "  "), undefined);
});

test("Sonance: «Product Category > Product Sub Category»", () => {
  assert.equal(sonanceProviderPath("IN-CEILING SPEAKERS", "Grille"), "IN-CEILING SPEAKERS > Grille");
  assert.equal(sonanceProviderPath("Amplifiers", ""), "Amplifiers");
  assert.equal(sonanceProviderPath("", null), undefined);
});

test("lista SoundTube: CATEGORIA > SEGMENTO > FAMILIA > TIPO con lo que venga", () => {
  assert.equal(soundTubeListPath({ categoria: "PARLANTES", segmento: "Comercial", familia: "Colgante", tipo: "" }), "PARLANTES > Comercial > Colgante");
  assert.equal(soundTubeListPath({}), undefined);
});

test("la ruta armada da la misma clave de equivalencia que la guardada", () => {
  assert.equal(equivalenceKey(sonanceProviderPath("In-Ceiling Speakers", "Grille")), "in-ceiling speakers > grille");
});

test("fuente de equivalencia de cada conector", () => {
  assert.equal(equivalenceSourceForSync("CRESTRON"), "crestron");
  assert.equal(equivalenceSourceForSync("CRESTRON_WEB"), "crestron");
  assert.equal(equivalenceSourceForSync("SONANCE"), "sonance");
  assert.equal(equivalenceSourceForSync("SOUNDTUBE"), "soundtube");
  assert.equal(equivalenceSourceForSync("HALL_RESEARCH_WEB"), "hall");
  assert.equal(equivalenceSourceForSync("EXCEL"), "excel");
  assert.equal(equivalenceSourceForSync("MANUAL"), "sync");
});

test("aviso de productos nuevos sin rubro", () => {
  assert.equal(uncategorizedNewNotice(0), null);
  assert.equal(uncategorizedNewNotice(-3), null);
  assert.equal(uncategorizedNewNotice(1), "1 producto nuevo quedó en Sin categorizar: ubicalo en Rubros › Sin rubro.");
  assert.equal(uncategorizedNewNotice(12), "12 productos nuevos quedaron en Sin categorizar: ubicalos en Rubros › Sin rubro.");
  assert.equal(SIN_RUBRO_HREF, "/admin/categories?tab=sin-rubro");
});

const TREE = [
  "SONIDO",
  "SONIDO > BAFLES PASIVOS",
  "SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR",
  "SONIDO > BAFLES PASIVOS > EMBUTIR",
  "SONIDO > ACCESORIOS P/BAFLES",
  "VIDEO > PANTALLAS",
];

test("IA: la ruta vale solo si coincide exacto con el árbol (formato aparte)", () => {
  assert.equal(normalizeRubroPath("Sonido › bafles  pasivos"), "SONIDO > BAFLES PASIVOS");
  assert.equal(matchRubroPath("sonido > bafles pasivos > bafles exterior", TREE), "SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR");
  assert.equal(matchRubroPath("Sonido › Bafles pasivos › Embutir", TREE), "SONIDO > BAFLES PASIVOS > EMBUTIR");
  assert.equal(matchRubroPath("SONIDO > BAFLES PASIVOS > EXTERIOR", TREE), null, "no se aproxima por parecido");
  assert.equal(matchRubroPath("SONIDO > PARLANTES", TREE), null, "no se inventan rutas");
  assert.equal(matchRubroPath(null, TREE), null);
});

test("IA en dos pasos: ramas de nivel 2 y lo que cuelga de la elegida", () => {
  assert.deepEqual(secondLevelPaths(TREE), ["SONIDO > ACCESORIOS P/BAFLES", "SONIDO > BAFLES PASIVOS", "VIDEO > PANTALLAS"]);
  assert.deepEqual(pathsUnder("SONIDO > BAFLES PASIVOS", TREE), [
    "SONIDO > BAFLES PASIVOS",
    "SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR",
    "SONIDO > BAFLES PASIVOS > EMBUTIR",
  ]);
});

test("equivalencias de varias fuentes: vale solo si coinciden", () => {
  assert.equal(consistentCategoryId([null, "a", "a", undefined]), "a");
  assert.equal(consistentCategoryId(["a", "b"]), null);
  assert.equal(consistentCategoryId([null, null]), null);
});

test("descripción del producto para la IA: solo los datos que hay", () => {
  assert.equal(describeProductForRubro({ productName: "LS6T", brand: "Sonance", sourceCategoryPath: "Landscape" }), "Producto: LS6T\nMarca: Sonance\nCategoría del proveedor (solo referencia): Landscape");
});
