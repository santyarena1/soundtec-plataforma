import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indexCatalog, normalizeSku, parseSubHeaderSkus } from "./catalog";
import { richTextToHtml, richTextToPlain, toFailedNormalizedProduct, toNormalizedProduct } from "./normalize";
import type { HallResearchProduct, RichTextSpan } from "./types";

const p = (text: string, spans: RichTextSpan[] = []) => ({
  type: "paragraph",
  text,
  spans,
});
const li = (text: string) => ({ type: "list-item", text, spans: [] });

function product(overrides: Partial<HallResearchProduct> & { data?: Partial<HallResearchProduct["data"]> } = {}): HallResearchProduct {
  return {
    id: "x1",
    uid: "at-ome-ms42",
    tags: ["HDMI", "USB-C"],
    ...overrides,
    data: {
      brand: "atlona",
      sub_brand: "omega",
      category: "switchers",
      header: [{ type: "heading1", text: "Omega 4x2 Matrix Switcher", spans: [] }],
      sub_header: [{ type: "heading2", text: "AT-OME-MS42", spans: [] }],
      header_description2: [p("Short pitch.")],
      slideshow_images: [
        { image: { url: "https://images.prismic.io/hallresearch/a.png?auto=format,compress", alt: null } },
        { image: { url: "https://images.prismic.io/hallresearch/b.png?auto=format,compress", alt: "Back" } },
      ],
      overview_paragraph_full: [p("Overview text."), li("Use A"), li("Use B")],
      features_body: [li("Feature 1"), li("Feature 2"), li("  ")],
      details_body: [],
      ...overrides.data,
    },
  };
}

describe("richTextToHtml", () => {
  it("párrafos → <p>", () => assert.equal(richTextToHtml([p("Hola"), p("Chau")]), "<p>Hola</p><p>Chau</p>"));
  it("agrupa list-items consecutivos en un solo <ul>", () =>
    assert.equal(richTextToHtml([p("Intro"), li("A"), li("B"), p("Fin")]), "<p>Intro</p><ul><li>A</li><li>B</li></ul><p>Fin</p>"));
  it("o-list-item → <ol>", () =>
    assert.equal(richTextToHtml([{ type: "o-list-item", text: "Uno", spans: [] }]), "<ol><li>Uno</li></ol>"));
  it("headings → h3/h4", () =>
    assert.equal(
      richTextToHtml([{ type: "heading2", text: "T", spans: [] }, { type: "heading6", text: "t", spans: [] }]),
      "<h3>T</h3><h4>t</h4>"
    ));
  it("aplica strong y em", () =>
    assert.equal(
      richTextToHtml([p("The Atlona switch", [{ start: 4, end: 10, type: "strong" }, { start: 11, end: 17, type: "em" }])]),
      "<p>The <strong>Atlona</strong> <em>switch</em></p>"
    ));
  it("escapa HTML y descarta bloques vacíos", () =>
    assert.equal(richTextToHtml([p("a < b & <script>"), p("   "), { type: "image" }]), "<p>a &lt; b &amp; &lt;script&gt;</p>"));
  it("hyperlink solo con http(s)", () => {
    const html = richTextToHtml([
      { type: "paragraph", text: "see docs", spans: [{ start: 4, end: 8, type: "hyperlink", data: { url: "https://x.com/d" } }] },
      { type: "paragraph", text: "bad", spans: [{ start: 0, end: 3, type: "hyperlink", data: { url: "javascript:alert(1)" } }] },
    ]);
    assert.equal(html, '<p>see <a href="https://x.com/d" rel="noopener noreferrer">docs</a></p><p>bad</p>');
  });
  it("null → vacío", () => assert.equal(richTextToHtml(null), ""));
});

describe("richTextToPlain", () => {
  it("párrafos y viñetas", () => assert.equal(richTextToPlain([p("Intro"), li("A"), li("B")]), "Intro\n\n• A\n• B"));
});

describe("toNormalizedProduct", () => {
  const n = toNormalizedProduct({ supplierSku: "AT-OME-MS42" }, product(), "2026-10-05T00:00:00.000Z");

  it("solo enriquece: match por supplierSku, preserva nombre, nunca precio/stock/marca", () => {
    assert.equal(n.matchField, "supplierSku");
    assert.equal(n.matchValue, "AT-OME-MS42");
    assert.equal(n.name, "AT-OME-MS42");
    assert.equal(n.preserveName, true);
    assert.equal(n.rawKey, "hallResearchWeb");
    for (const key of ["baseCostUsd", "stockStatus", "stockQuantity", "brandName", "categoryName", "salePriceUsd"] as const) {
      assert.equal(n[key], undefined, key);
    }
  });
  it("textos", () => {
    assert.equal(n.shortDescription, "Short pitch.");
    assert.equal(n.htmlContent, "<p>Overview text.</p><ul><li>Use A</li><li>Use B</li></ul>");
    assert.equal(n.longDescription, "Overview text.\n\n• Use A\n• Use B");
    assert.deepEqual(n.keyFeatures, ["Feature 1", "Feature 2"]);
  });
  it("imágenes con fuente propia, la primera principal, reemplaza la del Excel", () => {
    assert.deepEqual(n.images, [
      { url: "https://images.prismic.io/hallresearch/a.png?auto=format,compress", alt: undefined, isPrimary: true, source: "hallresearch" },
      { url: "https://images.prismic.io/hallresearch/b.png?auto=format,compress", alt: "Back", isPrimary: false, source: "hallresearch" },
    ]);
    assert.deepEqual(n.dropImageSources, ["hallresearch-excel"]);
  });
  it("URL, categoría, keywords y raw compacto", () => {
    assert.equal(n.vendorProductUrl, "https://hallresearch.com/product/at-ome-ms42");
    assert.equal(n.sourceCategoryPath, "Atlona > Omega > Switchers");
    assert.equal(n.metaKeywords, "HDMI, USB-C");
    assert.deepEqual(n.raw, {
      uid: "at-ome-ms42",
      title: "Omega 4x2 Matrix Switcher",
      brand: "atlona",
      sub_brand: "omega",
      category: "switchers",
      tags: ["HDMI", "USB-C"],
      fetchedAt: "2026-10-05T00:00:00.000Z",
    });
  });
  it("fallbacks: shortDescription = título, details_body se agrega, sin imágenes no borra nada", () => {
    const m = toNormalizedProduct(
      { supplierSku: "HT-X" },
      product({ data: { brand: "hall", sub_brand: "", category: "gem-ex", header_description2: [], slideshow_images: [], details_body: [p("Details")] } })
    );
    assert.equal(m.shortDescription, "Omega 4x2 Matrix Switcher");
    assert.equal(m.htmlContent, "<p>Overview text.</p><ul><li>Use A</li><li>Use B</li></ul>\n<p>Details</p>");
    assert.equal(m.images, undefined);
    assert.equal(m.dropImageSources, undefined);
    assert.equal(m.sourceCategoryPath, "Hall Tech > Gem Ex");
  });
});

describe("toFailedNormalizedProduct", () => {
  it("solo deja raw, no pisa nada", () => {
    const f = toFailedNormalizedProduct({ supplierSku: "AT-NOPE" }, { notFound: true, fetchedAt: "t" });
    assert.deepEqual(f, {
      matchField: "supplierSku",
      matchValue: "AT-NOPE",
      name: "AT-NOPE",
      preserveName: true,
      rawKey: "hallResearchWeb",
      raw: { notFound: true, fetchedAt: "t" },
    });
  });
});

describe("indexCatalog", () => {
  const a = product();
  const b = product({
    id: "x2",
    uid: "jav-cntl-h1611",
    data: { sub_header: [{ type: "heading2", text: "JAV-CNTL-H1611 (formerly AT-DISP-CTRL)", spans: [] }] },
  });
  const c = product({ id: "x3", uid: "at-vtp-700vl-bl", data: { sub_header: [{ type: "heading2", text: "AT-VTP-700VL", spans: [] }] } });
  const d = product({ id: "x4", uid: "omnistream", data: { sub_header: [] } });
  const index = indexCatalog([a, b, c, d]);

  it("matchea por sub_header y por uid", () => {
    assert.equal(index.get("AT-OME-MS42"), a);
    assert.equal(index.get("AT-VTP-700VL"), c);
    assert.equal(index.get("AT-VTP-700VL-BL"), c);
    assert.equal(index.get("OMNISTREAM"), d);
  });
  it("sub_header sin el paréntesis, y alias formerly", () => {
    assert.equal(index.get("JAV-CNTL-H1611"), b);
    assert.equal(index.get("AT-DISP-CTRL"), b);
  });
  it("normalizeSku y parseSubHeaderSkus", () => {
    assert.equal(normalizeSku("  at-ome-ms42 "), "AT-OME-MS42");
    assert.deepEqual(parseSubHeaderSkus([{ type: "heading2", text: "AT-AVA-F1311 (aka HT-AIM-70)" }]), {
      primary: "AT-AVA-F1311",
      aliases: ["HT-AIM-70"],
    });
  });
});
