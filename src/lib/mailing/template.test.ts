import { test } from "node:test";
import assert from "node:assert/strict";
import { fillVariables, variableKey, variablesIn } from "./variables";
import { renderCampaignEmail } from "./template";
import { readBlocks, type MailBlock } from "./blocks";
import { recipientStage, rate } from "./stats";

const footer = { company: "Soundtec S.R.L.", address: "Av. Siempreviva 742, CABA", reason: "Recibís este mail porque sos cliente." };
const origin = "https://www.soundtecportal.com.ar";

test("variables: nombre es el primer nombre, empresa y columnas extra", () => {
  const contact = { email: "ana@estudio.com", name: "Ana María Gómez", company: "Estudio AV", fields: { "Ciudad de entrega": "Rosario" } };
  assert.equal(fillVariables("Hola {{nombre}} de {{empresa}}", contact), "Hola Ana de Estudio AV");
  assert.equal(fillVariables("{{nombre_completo}} <{{email}}>", contact), "Ana María Gómez <ana@estudio.com>");
  assert.equal(fillVariables("Envío a {{ciudad_de_entrega}}", contact), "Envío a Rosario");
  assert.equal(fillVariables("Envío a {{ Ciudad de entrega }}", contact), "Envío a Rosario");
});

test("variables: valor por defecto y limpieza cuando falta el dato", () => {
  const contact = { email: "x@y.com", name: null, company: "" };
  assert.equal(fillVariables("Hola {{nombre|colega}}, ¿cómo va?", contact), "Hola colega, ¿cómo va?");
  assert.equal(fillVariables("Hola {{nombre}}, ¿cómo va?", contact), "Hola, ¿cómo va?");
  assert.equal(fillVariables("Sin variables", contact), "Sin variables");
});

test("variableKey normaliza acentos y espacios; variablesIn lista las usadas", () => {
  assert.equal(variableKey("Razón Social"), "razon_social");
  assert.equal(variableKey("  Teléfono / WhatsApp "), "telefono_whatsapp");
  assert.deepEqual(variablesIn("{{nombre}} {{Empresa}} {{nombre|x}}").sort(), ["empresa", "nombre"]);
});

test("plantilla: personaliza asunto y cuerpo, escapa HTML y lleva enlace de baja y pie", () => {
  const blocks: MailBlock[] = [
    { id: "a", type: "heading", text: "Promo para {{empresa}}", size: "xl" },
    { id: "b", type: "text", text: "Hola {{nombre}},\n\nMirá **esto** y [el catálogo](/catalogo). <script>alert(1)</script>" },
    { id: "c", type: "button", label: "Ver promo", href: "https://www.soundtecportal.com.ar/catalogo?x=1&y=2" },
  ];
  const mail = renderCampaignEmail({
    subject: "{{nombre}}, llegaron equipos",
    preheader: "Stock disponible",
    blocks,
    contact: { email: "ana@estudio.com", name: "Ana Gómez", company: "Estudio AV" },
    unsubscribeUrl: "https://www.soundtecportal.com.ar/baja/tok",
    footer,
    origin,
  });
  assert.equal(mail.subject, "Ana, llegaron equipos");
  assert.match(mail.html, /Promo para Estudio AV/);
  assert.match(mail.html, /<strong[^>]*>esto<\/strong>/);
  assert.match(mail.html, /href="https:\/\/www\.soundtecportal\.com\.ar\/catalogo"/);
  assert.ok(!mail.html.includes("<script>"), "no debe dejar pasar HTML del texto");
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /x=1&amp;y=2/);
  assert.match(mail.html, /href="https:\/\/www\.soundtecportal\.com\.ar\/baja\/tok"/);
  assert.match(mail.html, /Av\. Siempreviva 742/);
  assert.match(mail.html, /logo_soundtec\.png/);
  assert.match(mail.html, /Stock disponible/);
  assert.match(mail.text, /Hola Ana,/);
  assert.match(mail.text, /el catálogo \(\/catalogo\)/);
  assert.match(mail.text, /https:\/\/www\.soundtecportal\.com\.ar\/baja\/tok/);
});

test("plantilla: productos en grilla de a dos, con precio y etiqueta solo si se cargaron", () => {
  const item = (n: number, priceText = "", badge = "") => ({
    productId: `p${n}`,
    title: `SM-${n}`,
    subtitle: "Parlante de embutir",
    brand: "Sonance",
    imageUrl: `/uploads/p${n}.jpg`,
    url: `${origin}/catalogo/p${n}`,
    priceText,
    badge,
  });
  const mail = renderCampaignEmail({
    subject: "x",
    blocks: [{ id: "p", type: "products", title: "Ingresos", items: [item(1, "USD 1.290 + IVA", "Oferta"), item(2), item(3)], cta: "Ver ficha" }],
    contact: { email: "a@b.com" },
    unsubscribeUrl: "#",
    footer,
    origin,
  });
  assert.equal((mail.html.match(/class="col"/g) ?? []).length, 4, "3 productos = 2 filas de 2 celdas");
  assert.match(mail.html, /src="https:\/\/www\.soundtecportal\.com\.ar\/uploads\/p1\.jpg"/);
  assert.equal((mail.html.match(/USD 1\.290 \+ IVA/g) ?? []).length, 1);
  assert.match(mail.html, /Oferta/);
  assert.match(mail.text, /Sonance SM-1 · USD 1\.290 \+ IVA · https:\/\/www\.soundtecportal\.com\.ar\/catalogo\/p1/);
});

test("readBlocks descarta lo que no entiende y completa valores por defecto", () => {
  const blocks = readBlocks([{ id: "1", type: "heading", text: "Hola" }, { id: "2", type: "video" }, "basura", { id: "3", type: "divider" }]);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { id: "1", type: "heading", text: "Hola", size: "xl" });
  assert.deepEqual(readBlocks(null), []);
});

test("estado de cada destinatario y porcentajes", () => {
  assert.equal(recipientStage({ status: "SENT", openedAt: new Date(), clickedAt: new Date() }).label, "Hizo clic");
  assert.equal(recipientStage({ status: "SENT", openedAt: new Date(), unsubscribedAt: new Date() }).label, "Se dio de baja");
  assert.equal(recipientStage({ status: "SENT", bouncedAt: new Date(), bounceType: "Transient" }).label, "Rebote temporal");
  assert.equal(recipientStage({ status: "SIMULATED" }).label, "Simulado (no salió)");
  assert.equal(recipientStage({ status: "QUEUED" }).label, "En cola");
  assert.equal(rate(1, 3), 33.3);
  assert.equal(rate(5, 0), 0);
});
