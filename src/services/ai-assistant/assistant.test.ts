/**
 * Tests del asistente que no necesitan base de datos ni OpenAI: análisis de
 * la pregunta, presupuesto de contexto, redacción por scope, atajos sin LLM,
 * cache y reglas del recordatorio de contacto.
 *
 * Los casos usan modelos reales del catálogo (Crestron CP4N, Sonance SA68).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeQuestion, extractModelCodes, normalizeQuestion } from "./intent";
import { buildContext, buildProductSheet, compressHistory, prioritizeSpecs } from "./context";
import { buildSuggestions, noCandidatesAnswer, tryDeterministicAnswer } from "./deterministic";
import { buildCacheKey, cacheNormalizeQuestion, knowledgeVersion } from "./cache";
import { shouldShowLeadReminder } from "./session";
import { hasAnyLeadData } from "./leads";
import { LIMITS, candidateLimitFor } from "./budget";
import { expandSearchTerms } from "./synonyms";
import type { CandidateProduct, QuestionAnalysis } from "./types";

function makeCandidate(overrides: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    id: "prod-sa68",
    label: "P1",
    name: "Sonance SA68 Amplificador",
    brandName: "Sonance",
    categoryName: "Amplificadores",
    familyName: null,
    internalSku: "SA68",
    supplierSku: "SA68-US",
    modelNumber: "SA68",
    manufacturerItem: "SA68",
    shortDescription: "Amplificador de 8 canales para instalaciones fijas.",
    longDescription: null,
    htmlText: null,
    keyFeatures: ["8 canales", "Diseño para rack"],
    specifications: [
      { label: "IP Rating", value: "IP66" },
      { label: "Power", value: "60 W" },
      { label: "Color", value: "Negro" },
    ],
    documents: [{ name: "Spec Sheet", url: "https://example.com/sa68.pdf", type: "Spec Sheets" }],
    relations: [{ kind: "ACCESSORY", name: "Soporte de rack", quantity: 1 }],
    isCrestronHomeCompatible: false,
    isDiscontinued: false,
    isCustomizable: false,
    weightKg: 4.5,
    dimensionsCm: { width: 43, height: 4.4, depth: 30 },
    imageUrl: null,
    updatedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function analyze(question: string): QuestionAnalysis {
  return analyzeQuestion(question, ["Sonance", "Crestron", "SoundTube"]);
}

describe("análisis de la pregunta", () => {
  it("reconoce códigos de modelo en distintas escrituras", () => {
    assert.deepEqual(extractModelCodes("¿Qué es el CP4N?"), ["CP4N"]);
    assert.deepEqual(extractModelCodes("dame info de DM-NVX-360"), ["DM-NVX-360"]);
    assert.deepEqual(extractModelCodes("el sa68 sirve?"), ["sa68"]);
  });

  it("no confunde siglas técnicas con modelos", () => {
    assert.deepEqual(extractModelCodes("¿tiene HDMI y USB?"), []);
    assert.deepEqual(extractModelCodes("¿es IP68?"), []);
  });

  it("detecta la marca aunque cambie el formato", () => {
    assert.ok(analyze("qué parlante sonance sirve para exterior").brandNames.includes("Sonance"));
  });

  it("clasifica la intención", () => {
    assert.equal(analyze("Comparame CP4 y CP4N").intent, "COMPARISON");
    assert.equal(analyze("Necesito un parlante para exterior cerca de una pileta").intent, "RECOMMENDATION");
    assert.equal(analyze("¿Este producto es compatible con Crestron Home?").intent, "COMPATIBILITY");
    assert.equal(analyze("¿Qué accesorios necesita este producto?").intent, "ACCESSORY");
    assert.equal(analyze("hola").intent, "GREETING");
  });

  it("detecta el atributo consultado", () => {
    const ip = analyze("¿El Sonance SA68 es IP68?");
    assert.equal(ip.attributes[0]?.key, "ip_rating");
    const weight = analyze("¿cuánto pesa el SA68?");
    assert.ok(weight.attributes.some((attribute) => attribute.key === "weight"));
  });

  it("reconoce una pregunta de seguimiento", () => {
    assert.equal(analyze("¿y cuál usarías para exterior?").isFollowUp, true);
    assert.equal(analyze("¿el CP4N sirve para exterior?").isFollowUp, false);
  });

  it("normaliza acentos y espacios", () => {
    assert.equal(normalizeQuestion("  ¿Cuántas  ENTRADAS tiene? "), "¿cuantas entradas tiene?");
  });
});

describe("contexto y presupuesto", () => {
  it("pone primero la spec que responde la pregunta", () => {
    const candidate = makeCandidate();
    const ordered = prioritizeSpecs(candidate.specifications, analyze("¿es IP68?"));
    assert.equal(ordered[0].label, "IP Rating");
  });

  it("nunca supera el tope de specs por producto", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      label: `Campo ${index}`,
      value: `Valor ${index}`,
    }));
    const ordered = prioritizeSpecs(many, analyze("¿cuánto pesa?"));
    assert.ok(ordered.length <= LIMITS.maxSpecsPerProduct);
  });

  it("la ficha pública no incluye costo ni stock", () => {
    const candidate = makeCandidate({
      admin: { baseCostUsd: 1234.56, stockStatus: "IN_STOCK", stockQuantity: 9 },
    });
    const sheet = buildProductSheet(candidate, analyze("¿es IP66?"), "PUBLIC");
    assert.ok(!sheet.includes("1234"));
    assert.ok(!sheet.toLowerCase().includes("costo"));
    assert.ok(!sheet.toLowerCase().includes("stock"));
  });

  it("la ficha admin sí puede incluir costo y stock", () => {
    const candidate = makeCandidate({
      admin: { baseCostUsd: 1234.56, stockStatus: "IN_STOCK", stockQuantity: 9 },
    });
    const sheet = buildProductSheet(candidate, analyze("¿cuánto cuesta?"), "ADMIN");
    assert.ok(sheet.includes("1234.56"));
    assert.ok(sheet.toLowerCase().includes("stock"));
  });

  it("recorta el contexto cuando hay demasiados productos", () => {
    const manySpecs = Array.from({ length: 30 }, (_, index) => ({
      label: `Característica número ${index}`,
      value: `Valor bastante largo para ocupar espacio en la ficha ${index}`,
    }));
    const candidates = Array.from({ length: 8 }, (_, index) =>
      makeCandidate({
        id: `p${index}`,
        label: `P${index + 1}`,
        specifications: manySpecs,
        longDescription: "z".repeat(3000),
      })
    );
    const context = buildContext(candidates, analyze("necesito algo para exterior"), "PUBLIC");
    assert.ok(context.chars <= LIMITS.maxContextChars + LIMITS.maxProductSheetChars);
    assert.ok(context.used.length < candidates.length);
  });

  it("limita los candidatos según la intención", () => {
    assert.equal(candidateLimitFor("COMPARISON"), 2);
    assert.equal(candidateLimitFor("SPEC_LOOKUP"), 3);
    assert.ok(candidateLimitFor("RECOMMENDATION") <= 6);
  });

  it("comprime el historial a los últimos turnos", () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: "y".repeat(900),
    }));
    const compressed = compressHistory(history);
    assert.equal(compressed.length, LIMITS.maxHistoryTurns * 2);
    for (const turn of compressed) {
      assert.ok(turn.content.length <= LIMITS.maxHistoryChars + 1);
    }
  });
});

describe("respuestas sin LLM", () => {
  it("responde una spec inequívoca copiando el dato", () => {
    const analysis = analyze("¿El SA68 es IP68?");
    const answer = tryDeterministicAnswer({
      analysis,
      candidates: [makeCandidate()],
      scope: "PUBLIC",
    });
    assert.ok(answer);
    assert.equal(answer?.meta.usedLlm, false);
    assert.ok(answer?.answer.includes("IP66"));
    assert.equal(answer?.sources[0].type, "SPECIFICATION");
    assert.equal(answer?.sources[0].productId, "prod-sa68");
  });

  it("responde el peso desde el campo del producto", () => {
    const answer = tryDeterministicAnswer({
      analysis: analyze("¿cuánto pesa el SA68?"),
      candidates: [makeCandidate()],
      scope: "PUBLIC",
    });
    assert.ok(answer?.answer.includes("4.5"));
  });

  it("no arriesga un atajo en comparaciones ni recomendaciones", () => {
    assert.equal(
      tryDeterministicAnswer({
        analysis: analyze("Comparame el SA68 y el CP4N por peso"),
        candidates: [makeCandidate(), makeCandidate({ id: "b", label: "P2" })],
        scope: "PUBLIC",
      }),
      null
    );
  });

  it("no afirma compatibilidad cuando no está declarada", () => {
    const answer = tryDeterministicAnswer({
      analysis: analyze("¿es compatible con Crestron Home?"),
      candidates: [makeCandidate({ isCrestronHomeCompatible: false })],
      scope: "PUBLIC",
    });
    assert.equal(answer?.status, "PARTIAL");
    assert.ok(/no figura/i.test(answer?.answer ?? ""));
  });

  it("sin candidatos avisa que no hay información", () => {
    const answer = noCandidatesAnswer("¿tienen el modelo XYZ-999?");
    assert.equal(answer.status, "INSUFFICIENT_INFORMATION");
    assert.equal(answer.meta.usedLlm, false);
  });

  it("las sugerencias salen del contexto real, no del modelo", () => {
    const suggestions = buildSuggestions({
      analysis: analyze("¿qué amplificador me sirve?"),
      candidates: [makeCandidate(), makeCandidate({ id: "b", label: "P2", name: "Sonance DSP 2-150" })],
    });
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some((suggestion) => /comparar/i.test(suggestion)));
  });
});

describe("puente español → inglés del retrieval", () => {
  it("traduce los términos de aplicación al idioma de las fichas", () => {
    const terms = expandSearchTerms(["parlante", "exterior", "pileta"]);
    assert.ok(terms.includes("speaker"));
    assert.ok(terms.includes("outdoor"));
    assert.ok(terms.includes("parlante"), "el término original se conserva");
  });

  it("no devuelve más términos de los que el retrieval puede pagar", () => {
    const terms = expandSearchTerms(
      ["parlante", "exterior", "pileta", "restaurante", "hotel", "amplificador", "techo"],
      8
    );
    assert.ok(terms.length <= 8);
    assert.equal(new Set(terms).size, terms.length, "sin duplicados");
  });
});

describe("cache", () => {
  it("no mezcla respuestas públicas con las de admin", () => {
    const base = { question: "¿es IP66?", productIds: ["p1"], knowledgeVersion: "v1" };
    assert.notEqual(
      buildCacheKey({ ...base, scope: "PUBLIC" }),
      buildCacheKey({ ...base, scope: "ADMIN" })
    );
  });

  it("la clave no depende del orden de los productos", () => {
    const a = buildCacheKey({ scope: "PUBLIC", question: "x", productIds: ["a", "b"], knowledgeVersion: "v" });
    const b = buildCacheKey({ scope: "PUBLIC", question: "x", productIds: ["b", "a"], knowledgeVersion: "v" });
    assert.equal(a, b);
  });

  it("cambiar la ficha invalida la entrada", () => {
    const before = knowledgeVersion([{ id: "p1", updatedAtMs: 1 }]);
    const after = knowledgeVersion([{ id: "p1", updatedAtMs: 2 }]);
    assert.notEqual(before, after);
  });

  it("variantes triviales de la misma pregunta comparten entrada", () => {
    assert.equal(cacheNormalizeQuestion("¿El SA68 es IP66?"), cacheNormalizeQuestion("el sa68 es ip66"));
  });
});

describe("leads y recordatorio", () => {
  it("un formulario vacío no genera registro", () => {
    assert.equal(hasAnyLeadData({ sessionId: "s", name: "", email: "   ", phone: null }), false);
    assert.equal(hasAnyLeadData({ sessionId: "s", phone: "11 5555 5555" }), true);
  });

  it("no aparece antes de la tercera pregunta", () => {
    for (const questionCount of [1, 2]) {
      assert.equal(
        shouldShowLeadReminder({
          questionCount,
          leadCaptured: false,
          reminderShownAt: null,
          reminderDismissedAt: null,
        }),
        false
      );
    }
  });

  it("aparece al superar dos preguntas sin datos", () => {
    assert.equal(
      shouldShowLeadReminder({
        questionCount: 3,
        leadCaptured: false,
        reminderShownAt: null,
        reminderDismissedAt: null,
      }),
      true
    );
  });

  it("no vuelve a aparecer si ya dejó datos", () => {
    assert.equal(
      shouldShowLeadReminder({
        questionCount: 9,
        leadCaptured: true,
        reminderShownAt: null,
        reminderDismissedAt: null,
      }),
      false
    );
  });

  it("después de un «ahora no» no insiste en cada mensaje", () => {
    const dismissed = new Date();
    const shown = [4, 5, 7, 8].map((questionCount) =>
      shouldShowLeadReminder({
        questionCount,
        leadCaptured: false,
        reminderShownAt: dismissed,
        reminderDismissedAt: dismissed,
      })
    );
    assert.deepEqual(shown, [false, false, false, false]);
    assert.equal(
      shouldShowLeadReminder({
        questionCount: 6,
        leadCaptured: false,
        reminderShownAt: dismissed,
        reminderDismissedAt: dismissed,
      }),
      true
    );
  });
});
