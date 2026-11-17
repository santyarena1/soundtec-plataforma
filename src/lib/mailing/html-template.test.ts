import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { analyzeEmailHtml, hostImages, htmlToPlainText, readTemplateZip, sanitizeEmailHtml } from "./html-template";
import { contentWidthPx, finalizeCustomHtml, finalizeCustomText, hasUnsubscribeMarker } from "./html-finalize";

const footer = { company: "Soundtec S.R.L.", address: "Av. Ejemplo 1234, CABA", reason: "Recibís este mail porque sos cliente." };
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

test("saneo: saca scripts, iframes, formularios, handlers y URLs javascript:, deja tablas y estilos", () => {
  const dirty = `<!doctype html><html><head><style>.x{color:red} .y{width:expression(alert(1))}</style><script>alert(1)</script><link rel="stylesheet" href="https://evil.com/x.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><meta http-equiv="refresh" content="0;url=https://evil.com"></head>
<body onload="alert(1)"><table width="600" style="background:#fff"><tr><td class="x" onclick="steal()">Hola</td></tr></table>
<a href="javascript:alert(1)">mal</a><a href=" JaVa&#x09;script:alert(1)">mal2</a><a href="https://soundtec.com.ar">bien</a>
<iframe src="https://evil.com"></iframe><form action="https://evil.com"><p>dentro del form</p><input name="clave"><button>Enviar</button></form>
<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x"><img src="data:image/png;base64,iVBORw0KGgo=" alt="ok"><div style="background:url(javascript:alert(1))">z</div>
<!--[if mso]><table><tr><td>Outlook</td></tr></table><![endif]--><!-- <script>alert(1)</script> --></body></html>`;
  const clean = sanitizeEmailHtml(dirty);
  for (const bad of ["<script", "alert(1)</script>", "onload", "onclick", "javascript:", "<iframe", "<form", "<input", "<button", "evil.com", "expression(", "data:text/html"]) {
    assert.ok(!clean.toLowerCase().includes(bad.toLowerCase()), `quedó «${bad}»`);
  }
  assert.match(clean, /<table width="600" style="background:#fff">/);
  assert.match(clean, /dentro del form/);
  assert.match(clean, /href="https:\/\/soundtec\.com\.ar"/);
  assert.match(clean, /fonts\.googleapis\.com/);
  assert.match(clean, /data:image\/png;base64/);
  assert.match(clean, /\[if mso\]/);
  assert.match(clean, /\.x\{color:red\}/);
});

test("imágenes: las del zip y las base64 van al almacenamiento; las absolutas quedan; las que faltan se avisan", async () => {
  const zip = zipSync({
    "newsletter/index.html": strToU8(`<html><body><img src="img/banner.png" alt="Banner"><img src="./img/Banner.png" alt="otra vez"><table><tr><td background="img/fondo.jpg" style="background-image:url('img/fondo.jpg')">x</td></tr></table><img src="https://cdn.ejemplo.com/a.png" alt="cdn"><img src="data:image/png;base64,${Buffer.from(PNG).toString("base64")}" alt="inline"><img src="img/no-existe.png" alt="falta"></body></html>`),
    "newsletter/img/banner.png": PNG,
    "newsletter/img/fondo.jpg": PNG,
    "__MACOSX/._index.html": strToU8("basura"),
    "leeme.txt": strToU8("no se usa"),
  });
  const parsed = readTemplateZip(zip);
  assert.equal(parsed.htmlPath, "newsletter/index.html");
  assert.deepEqual(parsed.files.map((f) => f.path).sort(), ["newsletter/img/banner.png", "newsletter/img/fondo.jpg"]);
  const stored: string[] = [];
  const result = await hostImages(parsed.html, {
    files: parsed.files,
    htmlPath: parsed.htmlPath,
    store: async (_bytes, type, ext) => {
      stored.push(type);
      return `https://www.soundtecportal.com.ar/api/files/mailing/${stored.length}.${ext}`;
    },
  });
  assert.equal(stored.length, 3, "banner (una sola vez aunque aparezca dos veces), fondo y la base64");
  assert.ok(!result.html.toLowerCase().includes("img/banner.png"), "el banner quedó con su ruta local");
  assert.ok(!result.html.includes("data:image"));
  assert.match(result.html, /background="https:\/\/www\.soundtecportal\.com\.ar\/api\/files\/mailing\/\d\.jpg"/);
  assert.match(result.html, /url\('https:\/\/www\.soundtecportal\.com\.ar\/api\/files\/mailing\/\d\.jpg'\)/);
  assert.match(result.html, /https:\/\/cdn\.ejemplo\.com\/a\.png/);
  assert.deepEqual(result.missing, ["img/no-existe.png"]);
});

test("zip sin HTML da un error claro", () => {
  assert.throws(() => readTemplateZip(zipSync({ "foto.png": PNG })), /no trae ningún archivo \.html/);
});

test("avisos: peso, imágenes relativas, http, sin alt, ancho y falta de baja", () => {
  const html = `<html><body><table width="800"><tr><td><img src="foto.png"><a href="http://soundtec.com.ar">x</a><img src="http://x.com/a.png" alt="a"></td></tr></table>${"<p>relleno</p>".repeat(8000)}</body></html>`;
  const codes = analyzeEmailHtml(html).map((w) => w.code).sort();
  assert.deepEqual(codes, ["http_image", "http_link", "missing_alt", "no_unsubscribe", "relative_image", "size", "wide"]);
  const ok = `<html><body><div style="max-width:900px;width:600px"><img src="https://a.com/x.png" alt=""><a href="{{baja}}">baja</a></div></body></html>`;
  assert.deepEqual(analyzeEmailHtml(ok), []);
});

test("final: variables escapadas, {{baja}} en href y suelto, preheader oculto después del <body>", () => {
  const html = `<html><body class="b"><h1>Hola {{nombre|colega}} de {{empresa}}</h1><p>{{ciudad}}</p><a href="{{baja}}">Darme de baja</a> o {{baja}}</body></html>`;
  assert.ok(hasUnsubscribeMarker(html));
  const out = finalizeCustomHtml({
    html,
    contact: { email: "ana@x.com", name: "Ana Gómez", company: "<b>Estudio</b> & Co", fields: { Ciudad: "Rosario" } },
    preheader: "Promo para {{nombre}}",
    unsubscribeUrl: "https://www.soundtecportal.com.ar/baja/tok?a=1&b=2",
    footer,
  });
  assert.match(out, /Hola Ana de &lt;b&gt;Estudio&lt;\/b&gt; &amp; Co/);
  assert.match(out, /<p>Rosario<\/p>/);
  assert.match(out, /<a href="https:\/\/www\.soundtecportal\.com\.ar\/baja\/tok\?a=1&amp;b=2">Darme de baja<\/a>/);
  assert.match(out, /o <a href="https:\/\/www\.soundtecportal\.com\.ar\/baja\/tok\?a=1&amp;b=2"[^>]*>darte de baja<\/a>/);
  assert.match(out, /<body class="b"><div style="display:none[^"]*">Promo para Ana/);
  assert.ok(!out.includes("Soundtec S.R.L."), "con {{baja}} no se agrega el pie");
});

test("final: sin {{baja}} agrega el pie legal antes de </body>; sin body, al final", () => {
  const out = finalizeCustomHtml({ html: "<html><body><p>Hola {{nombre}}</p></body></html>", contact: { email: "a@b.com" }, unsubscribeUrl: "https://x.com/baja/t", footer });
  assert.match(out, /<p>Hola <\/p><table[^>]*>[\s\S]*Soundtec S\.R\.L\.[\s\S]*Av\. Ejemplo 1234[\s\S]*href="https:\/\/x\.com\/baja\/t"[\s\S]*<\/table><\/body>/);
  const fragment = finalizeCustomHtml({ html: "<p>Hola</p>", contact: { email: "a@b.com" }, preheader: "Pre", unsubscribeUrl: "u", footer });
  assert.match(fragment, /^<div style="display:none[^"]*">Pre[\s\S]*<p>Hola<\/p><table/);
});

test("texto plano: párrafos, enlaces con su dirección, sin estilos ni preheader oculto", () => {
  const html = `<html><head><style>p{color:red}</style><title>t</title></head><body><div style="display:none">oculto</div><h1>Ingresos   de la semana</h1><p>Hola {{nombre}},<br>mirá <a href="https://soundtecportal.com.ar/catalogo">el catálogo</a>.</p><table><tr><td>LS12T</td><td>USD 1.290</td></tr></table><img src="x.png" alt="foto"><p><a href="{{baja}}">Baja</a></p></body></html>`;
  const text = htmlToPlainText(html);
  assert.equal(text, "Ingresos de la semana\n\nHola {{nombre}},\nmirá el catálogo (https://soundtecportal.com.ar/catalogo).\n\nLS12T USD 1.290\n\nBaja ({{baja}})");
  const final = finalizeCustomText({ text, contact: { email: "a@b.com", name: "Ana" }, unsubscribeUrl: "https://x.com/baja/t", footer, hadMarker: true });
  assert.match(final, /Hola Ana,/);
  assert.match(final, /Baja \(https:\/\/x\.com\/baja\/t\)/);
  assert.ok(!final.includes("Soundtec S.R.L."));
  const withFooter = finalizeCustomText({ text: "Hola", contact: { email: "a@b.com" }, unsubscribeUrl: "https://x.com/baja/t", footer, hadMarker: false });
  assert.match(withFooter, /Para no recibir más estos mails: https:\/\/x\.com\/baja\/t/);
});

test("avisos: ancho fijo de 600 px sin max-width no se adapta al celular; con max-width o media query, sí", () => {
  const fixed = analyzeEmailHtml(`<html><body><table width="100%"><tr><td><table width="600"><tr><td><img src="https://a.com/x.png" width="600" alt="" style="width:100%"><a href="{{baja}}">baja</a></td></tr></table></td></tr></table></body></html>`);
  assert.deepEqual(fixed.map((w) => w.code), ["not_responsive"]);
  assert.match(fixed[0]!.message, /600 px.*no se adapta al celular/);
  const withMax = `<html><body><table width="600" style="width:100%;max-width:600px"><tr><td><a href="{{baja}}">baja</a></td></tr></table></body></html>`;
  assert.deepEqual(analyzeEmailHtml(withMax), []);
  const withMedia = `<html><head><style>@media (max-width:620px){.wrap{width:100%!important}}</style></head><body><table class="wrap" width="600"><tr><td><a href="{{baja}}">baja</a></td></tr></table></body></html>`;
  assert.deepEqual(analyzeEmailHtml(withMedia), []);
  const wide = analyzeEmailHtml(`<html><body><table width="900"><tr><td><a href="{{baja}}">baja</a></td></tr></table></body></html>`);
  assert.deepEqual(wide.map((w) => w.code), ["wide"], "si ya es más ancho que 700, alcanza con un aviso");
});

test("final: el pie legal toma el ancho del contenido: fijo si el diseño es fijo, adaptable si se achica", () => {
  assert.deepEqual(contentWidthPx(`<table width="100%"><tr><td><table width="600" cellpadding="0"><tr><td><img width="900"></td></tr></table></td></tr></table>`), { px: 600, fixed: true });
  assert.deepEqual(contentWidthPx(`<div style="max-width:640px;margin:0 auto">x</div>`), { px: 640, fixed: false });
  assert.equal(contentWidthPx(`<p>sin ancho</p>`), null);
  const out = finalizeCustomHtml({ html: `<html><body><table width="600"><tr><td>Hola</td></tr></table></body></html>`, contact: { email: "a@b.com" }, unsubscribeUrl: "https://x.com/baja/t", footer });
  assert.match(out, /<table role="presentation" width="600"[^>]*style="width:600px;background:#eef0f3"[^>]*>[\s\S]*Soundtec S\.R\.L\./);
  const fluid = finalizeCustomHtml({ html: `<html><body><table width="600" style="width:100%;max-width:600px"><tr><td>Hola</td></tr></table></body></html>`, contact: { email: "a@b.com" }, unsubscribeUrl: "u", footer });
  assert.match(fluid, /<table role="presentation" width="600"[^>]*style="width:100%;max-width:600px;background:#eef0f3"/);
});
