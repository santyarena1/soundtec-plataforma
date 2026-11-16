import assert from "node:assert/strict";
import { test } from "node:test";
import { assignF501Ids, F501_ID_RE, F501_VARIANTS, parseF501Variant, signalCode } from "./f501";
import { parseSheetFormat, rowsFor, sheetGeometry } from "./sheet-format";
import { appendRevision, cartelaRevision, nextRevisionCode, parseRevisions, revisionTableRows, type Revision } from "../revisions";
import { BOM_COLUMNS, BOM_PRICE_COLUMNS, bomCsv, CABLE_COLUMNS, cableScheduleCsv, exportFileName, type BomItem, type CsvMeta } from "../exports/csv";

// ---------- ID F501 ----------

test("F501: SALA-SEÑAL-NNN, conserva las etiquetas del plano técnico y numera las que faltan", () => {
  const ids = assignF501Ids(
    [
      { label: "HDMI-001", signal: "hdmi" },
      { label: null, signal: "hdmi" },
      { label: "NET-7", signal: "net" },
      { label: null, signal: "net" },
      { label: null, signal: "speaker" },
    ],
    "DIR",
  );
  assert.deepEqual(ids, ["DIR-HDMI-001", "DIR-HDMI-002", "DIR-NET-007", "DIR-NET-001", "DIR-SPEAKER-001"]);
  for (const id of ids) assert.match(id, F501_ID_RE);
});

test("F501: nunca repite un ID (ni dentro del ambiente ni entre ambientes)", () => {
  const taken = new Set<string>();
  const a = assignF501Ids([{ label: "HDMI-001", signal: "hdmi" }, { label: "HDMI-001", signal: "hdmi" }, { label: null, signal: "hdmi" }], "SAL", taken);
  const b = assignF501Ids([{ label: "HDMI-001", signal: "hdmi" }], "SAL2", taken);
  const all = [...a, ...b];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(a, ["SAL-HDMI-001", "SAL-HDMI-001-B", "SAL-HDMI-002"]);
  assert.equal(b[0], "SAL2-HDMI-001");
  // Muchos cables sin etiqueta de la misma señal: todos distintos y con formato válido.
  const many = assignF501Ids(Array.from({ length: 120 }, () => ({ label: null, signal: "lan" })), "AUD");
  assert.equal(new Set(many).size, 120);
  assert.equal(many[119], "AUD-LAN-120");
  for (const id of many) assert.match(id, F501_ID_RE);
});

test("F501: etiquetas a mano y nombres con acentos quedan en mayúsculas sin símbolos", () => {
  const [id] = assignF501Ids([{ label: "Proyector principal", signal: "hdmi" }], "Dirección");
  assert.equal(id, "DIRECCION-PROYECTOR-PRINCIPAL");
  assert.match(id!, F501_ID_RE);
  assert.equal(signalCode("Red / LAN"), "REDLAN");
  assert.equal(parseF501Variant("bandera"), "bandera");
  assert.equal(parseF501Variant("cualquiera"), "plana");
  assert.equal(F501_VARIANTS.plana.widthMm, 51);
  assert.equal(F501_VARIANTS.plana.heightMm, 25);
});

// ---------- Revisiones ----------

test("revisiones: letras correlativas A…Z, AA…", () => {
  assert.equal(nextRevisionCode(null), "A");
  assert.equal(nextRevisionCode("A"), "B");
  assert.equal(nextRevisionCode("Z"), "AA");
  assert.equal(nextRevisionCode("AZ"), "BA");
  assert.equal(nextRevisionCode("ZZ"), "AAA");
});

test("revisiones: emitir agrega al final sin tocar la lista y la tabla va de la más nueva a la más vieja", () => {
  const empty: Revision[] = [];
  const one = appendRevision(empty, { author: "Ana", description: "Primera emisión", status: "preliminar", date: new Date("2026-11-01T12:00:00Z") });
  const two = appendRevision(one, { author: "Ana", description: "Cambia la cámara", status: "aprobacion", date: new Date("2026-11-10T12:00:00Z") });
  assert.equal(empty.length, 0);
  assert.equal(one.length, 1);
  assert.deepEqual(two.map((r) => r.code), ["A", "B"]);
  const rows = revisionTableRows(two);
  assert.deepEqual(rows.map((r) => [r.code, r.status, r.current]), [["B", "Para aprobación", true], ["A", "Preliminar", false]]);
  assert.equal(rows[1]!.date, "01/11/2026");
  assert.deepEqual(cartelaRevision(two), { code: "B", status: "Para aprobación" });
  assert.deepEqual(cartelaRevision([]), { code: "—", status: "Borrador sin emitir" });
});

test("revisiones: el JSON guardado se lee descartando basura", () => {
  const list = parseRevisions([{ code: "A", date: "2026-11-01", author: "x", description: "y", status: "obra" }, { code: "B", status: "inventado" }, null, "texto"]);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.status, "obra");
  assert.deepEqual(parseRevisions(null), []);
});

// ---------- Formatos de hoja ----------

test("formatos: A3 conserva las medidas de siempre; Tabloid y ARCH D en pulgadas", () => {
  const a3 = sheetGeometry("a3");
  assert.deepEqual([a3.format.widthMm, a3.format.heightMm], [420, 297]);
  assert.deepEqual(a3.mainArea, { w: 272, h: 264 });
  assert.deepEqual(a3.wideArea, { w: 382, h: 214 });
  const tab = sheetGeometry("tabloid");
  assert.deepEqual([tab.format.widthMm, tab.format.heightMm], [431.8, 279.4]);
  const d = sheetGeometry("archd");
  assert.deepEqual([d.format.widthMm, d.format.heightMm], [914.4, 609.6]);
  assert.ok(d.mainArea.w > 2.5 * a3.mainArea.w && d.mainArea.h > 2 * a3.mainArea.h);
  // Tablas: más renglones en una hoja más alta, nunca menos que en A3.
  assert.equal(rowsFor(34, a3), 34);
  assert.equal(rowsFor(34, tab), 34);
  assert.ok(rowsFor(34, d) > 70);
  assert.equal(parseSheetFormat("archd"), "archd");
  assert.equal(parseSheetFormat("carta"), "a3");
});

// ---------- CSV ----------

const meta: CsvMeta = {
  brand: { name: "Soundtec", address: "Av. Siempre Viva 123", phone: "+54 11 5555-5555", email: "ventas@soundtec.com", web: "soundtec.com" },
  title: "Lista de materiales",
  project: "Oficinas Norte",
  client: "Cliente SA",
  revision: { code: "B", status: "Para aprobación" },
  date: "16/11/2026",
};

const items: BomItem[] = [
  { room: "Directorio", kind: "equipo", n: "1", brand: "Crestron", model: "UC-C160-T", quantity: 1, priceUsd: 4200, productId: "p1" },
  { room: "Directorio", kind: "equipo", n: "2", brand: "Samsung", model: "QM85C", quantity: 2, priceUsd: 3100.5, productId: "p2" },
  { room: "Directorio", kind: "cable", n: "", brand: "", model: "HDMI (cable a definir)", quantity: 3, meters: 18.5 },
];

/** Renglones del CSV sin comillas (para comparar columnas). */
const parse = (csv: string) => csv.split("\r\n").map((l) => (l ? l.split(";").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')) : []));

test("CSV de materiales del cliente: encabezado de marca, columnas exactas y sin precios", () => {
  const csv = bomCsv(items, meta, { prices: false });
  const rows = parse(csv);
  assert.equal(rows[0]![0], "Soundtec");
  assert.ok(rows[1]!.includes("Rev. B · Para aprobación"));
  const head = rows.find((r) => r[0] === "Ambiente")!;
  assert.deepEqual(head, [...BOM_COLUMNS]);
  assert.ok(!/precio unit|subtotal|usd|4200|3100/i.test(csv));
  const cable = rows.find((r) => r[1] === "Cable")!;
  assert.deepEqual(cable.slice(5), ["3", "tramos", "18,5"]);
});

test("CSV de materiales del panel: precio unitario y subtotal solo de equipos, con total", () => {
  const rows = parse(bomCsv(items, meta, { prices: true }));
  const head = rows.find((r) => r[0] === "Ambiente")!;
  assert.deepEqual(head, [...BOM_COLUMNS, ...BOM_PRICE_COLUMNS]);
  const tv = rows.find((r) => r[4] === "QM85C")!;
  assert.deepEqual(tv.slice(-2), ["3100,5", "6201"]);
  const cable = rows.find((r) => r[1] === "Cable")!;
  assert.deepEqual(cable.slice(-2), ["", ""]);
  const total = rows.find((r) => r[0]?.startsWith("Total equipos"))!;
  assert.equal(total[total.length - 1], "10401");
});

test("CSV de planilla de cables: columnas con el ID F501 primero", () => {
  const csv = cableScheduleCsv(
    [{ id: "DIR-HDMI-001", room: "Directorio", from: "1 · Codec", fromPort: "HDMI OUT", to: "2 · Pantalla", toPort: "HDMI 1", signal: "HDMI", cable: null, lengthM: 6.5, lengthKind: "Medido en plano" }],
    { ...meta, title: "Planilla de cables" },
    "esquema",
  );
  const rows = parse(csv);
  const hi = rows.findIndex((r) => r[0] === "ID F501");
  assert.deepEqual(rows[hi], [...CABLE_COLUMNS]);
  assert.deepEqual(rows[hi + 1], ["DIR-HDMI-001", "Directorio", "1 · Codec", "HDMI OUT", "2 · Pantalla", "HDMI 1", "HDMI", "A definir", "6,5", "Medido en plano"]);
  assert.equal(exportFileName("Planilla_cables", "Dirección Ñandú", "csv"), "Planilla_cables_Direccion_Nandu.csv");
});

// ---------- Láminas: hoja, cartela con revisión y etiquetas 51 × 25 ----------

test("láminas: @page del formato elegido, revisión en todas las cartelas y tabla solo en la primera", async () => {
  const { renderSheetsHtml } = await import("../../../server/room-builder/sheets/sheet-html");
  const page = { title: "Plano", scale: "1:50", room: "Sala", main: "", side: "" };
  const html = renderSheetsHtml([page, { ...page, title: "Planilla" }], {
    docTitle: "Láminas técnicas",
    project: "P",
    client: null,
    company: { name: "Soundtec", address: "", phone: "", email: "", web: "" },
    logo: "",
    color: "#1e3553",
    date: "16/11/2026",
    revision: "B",
    revisionStatus: "Para aprobación",
    revisions: [
      { code: "B", date: "10/11/2026", status: "Para aprobación", description: "Cambia la cámara", author: "Ana", current: true },
      { code: "A", date: "01/11/2026", status: "Preliminar", description: "Primera", author: "Ana", current: false },
    ],
    format: "archd",
  });
  assert.match(html, /@page \{ size: 914\.4mm 609\.6mm/);
  assert.equal((html.match(/<table class="c-revs">/g) ?? []).length, 1);
  assert.equal((html.match(/Para aprobación<\/b>/g) ?? []).length, 2);
  assert.equal((html.match(/<span>Rev\.<\/span><b>B<\/b>/g) ?? []).length, 2);
});

test("etiquetas F501: 51 × 25 mm, dos por cable con el mismo ID y punta A/B", async () => {
  const { labelPages, labelsPerSheet } = await import("../../../server/room-builder/sheets/sheet-pages");
  assert.deepEqual(labelsPerSheet("plana", sheetGeometry("a3")), { cols: 5, rows: 9 });
  assert.ok(labelsPerSheet("plana", sheetGeometry("archd")).cols >= 14);
  const cable = { tag: "DIR-HDMI-001", fromDevice: "1 · Codec", fromPort: "HDMI OUT", toDevice: "2 · Pantalla", toPort: "HDMI 1", signal: "HDMI", color: "#e11d48", cable: null, lengthM: 5, lengthKind: "plan" as const, points: [] };
  const [page] = labelPages([cable], "Directorio", { variant: "bandera" });
  assert.equal((page!.main.match(/DIR-HDMI-001/g) ?? []).length, 4);
  assert.match(page!.main, /Punta A · origen/);
  assert.match(page!.main, /Punta B · destino/);
  assert.match(page!.main, /height:50mm/);
});
