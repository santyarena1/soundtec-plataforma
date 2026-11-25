import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADMIN_QUESTIONS, DEFAULT_PUBLIC_QUESTIONS, MAX_SHOWN, defaultQuestions, parseQuestionsSetting, questionsFor, validateQuestions } from "./assistant-suggestions";
import { discountInfoFrom } from "./price-discount-label";

test("sin nada cargado se usan las preguntas de siempre en cada pantalla", () => {
  assert.deepEqual(questionsFor(null, "expo"), DEFAULT_PUBLIC_QUESTIONS);
  assert.deepEqual(questionsFor(null, "portal"), DEFAULT_PUBLIC_QUESTIONS);
  assert.deepEqual(questionsFor(null, "admin"), DEFAULT_ADMIN_QUESTIONS);
  assert.equal(parseQuestionsSetting("{roto"), null);
});

test("la lista inicial del editor se puede guardar tal cual (sin preguntas repetidas)", () => {
  const initial = defaultQuestions();
  assert.ok(validateQuestions(initial).ok);
  assert.deepEqual(questionsFor(initial, "admin").sort(), [...DEFAULT_ADMIN_QUESTIONS].sort());
  assert.deepEqual(questionsFor(initial, "expo").sort(), [...DEFAULT_PUBLIC_QUESTIONS].sort());
});

test("respeta orden, activas y contexto (sin contexto = todas)", () => {
  const saved = [
    { id: "1", text: "¿Tienen línea marina?", active: true, contexts: [] },
    { id: "2", text: "Solo portal", active: true, contexts: ["portal" as const] },
    { id: "3", text: "Apagada", active: false, contexts: [] },
  ];
  assert.deepEqual(questionsFor(saved, "portal"), ["¿Tienen línea marina?", "Solo portal"]);
  assert.deepEqual(questionsFor(saved, "expo"), ["¿Tienen línea marina?"]);
  const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), text: `Pregunta ${i}`, active: true, contexts: [] }));
  assert.equal(questionsFor(many, "catalogo").length, MAX_SHOWN);
});

test("validación: repetidas, vacías y contextos desconocidos no pasan", () => {
  assert.equal(validateQuestions([{ id: "1", text: "Hola che", active: true, contexts: [] }, { id: "2", text: "hola che", active: true, contexts: [] }]).ok, false);
  assert.equal(validateQuestions([{ id: "1", text: " ", active: true, contexts: [] }]).ok, false);
  assert.equal(validateQuestions([{ id: "1", text: "Ok pregunta", active: true, contexts: ["otro"] }]).ok, false);
});

test("descuento en el precio: origen producto, regla o cliente", () => {
  assert.equal(discountInfoFrom({ discountPercent: 0, priceBeforeDiscountUsd: 100, discountSource: null, appliedDiscountRule: null }), null);
  const product = discountInfoFrom({ discountPercent: 20, priceBeforeDiscountUsd: 305, discountSource: "PRODUCT", appliedDiscountRule: null });
  assert.equal(product?.origin, "PRODUCT");
  assert.equal(product?.listPriceUsd, 305);
  const rule = discountInfoFrom({ discountPercent: 10, priceBeforeDiscountUsd: 50, discountSource: "RULE", appliedDiscountRule: { name: "Sonance 10 %", clientId: null } });
  assert.equal(rule?.origin, "RULE");
  assert.match(rule!.originLabel, /Sonance 10 %/);
  const client = discountInfoFrom({ discountPercent: 5, priceBeforeDiscountUsd: 50, discountSource: "RULE", appliedDiscountRule: { name: "Integrador X", clientId: "c1" } });
  assert.equal(client?.origin, "CLIENT");
});
