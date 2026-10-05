import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, textToHtml } from "./html";

describe("escapeHtml", () => {
  it("escapa los cinco caracteres especiales", () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
  it("no doble-escapa en orden incorrecto", () => assert.equal(escapeHtml("&lt;"), "&amp;lt;"));
  it("texto plano queda igual", () => assert.equal(escapeHtml("Hola Juan"), "Hola Juan"));
});

describe("textToHtml", () => {
  it("escapa antes de convertir saltos de línea", () =>
    assert.equal(textToHtml("Hola <b>\nchau"), "Hola &lt;b&gt;<br>chau"));
});
