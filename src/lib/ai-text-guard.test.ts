import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_NO_DATA_MARKER,
  checkAiDescription,
  isAiNoDataMarker,
  isAiRefusal,
  isDescriptionPlaceholder,
  isUnusableAiDescription,
} from "./ai-text-guard";

test("negativas reales de la IA se detectan", () => {
  for (const text of [
    "Lo siento, no hay datos disponibles sobre el modelo SW-HS-3-C de Crestron.",
    "Lo siento, pero no tengo información específica sobre el producto DM-NVX-360 de Crestron.",
    "No dispongo de información sobre este producto.",
    "No hay datos disponibles.",
    "No tengo información sobre este producto.",
    "Lamentablemente, no cuento con datos técnicos de este modelo.",
    "Disculpá, no encontré información del modelo AM-200.",
    "El AM-200 es un equipo de Atlona. Sin embargo, no dispongo de información detallada sobre sus especificaciones; te recomiendo consultar el sitio del fabricante.",
    "Como modelo de lenguaje, no puedo confirmar las especificaciones de este equipo.",
    "Información específica no disponible para este modelo.",
  ]) {
    assert.equal(isAiRefusal(text), true, text);
    assert.equal(checkAiDescription(text).ok, false, text);
  }
});

test("el marcador fijo de «sin datos» se detecta con o sin adornos", () => {
  assert.equal(isAiNoDataMarker(AI_NO_DATA_MARKER), true);
  assert.equal(isAiNoDataMarker(` "${AI_NO_DATA_MARKER}." `), true);
  assert.equal(isAiNoDataMarker(`**${AI_NO_DATA_MARKER}**`), true);
  assert.deepEqual(checkAiDescription(AI_NO_DATA_MARKER), { ok: false, reason: "no_data" });
  assert.equal(isAiNoDataMarker("Amplificador de 8 canales con datos de red."), false);
});

test("textos válidos de ficha no se marcan", () => {
  for (const text of [
    "La licencia SW-HS-3-C habilita la agenda de salas en la nube de Crestron.",
    "No requiere servidor local: la agenda corre en la nube.",
    "Amplificador de ocho canales para audio distribuido.",
    "Parlante de techo de 6,5\" con tweeter pivotante, para ambientes residenciales y comerciales. No necesita caja trasera.",
    "Switcher HDMI 4x1 con control por IP y RS-232. No hay pérdida de calidad en la conmutación.",
    "Transmisor HDBaseT que extiende video 4K hasta 100 m. Los datos de control viajan por el mismo cable.",
  ]) {
    assert.equal(isAiRefusal(text), false, text);
    assert.equal(isDescriptionPlaceholder(text), false, text);
    assert.deepEqual(checkAiDescription(text), { ok: true, text: text.trim() });
  }
});

test("el relleno de los generadores no se guarda", () => {
  assert.equal(isDescriptionPlaceholder("SA-8 — descripción profesional no disponible en este momento."), true);
  assert.equal(isDescriptionPlaceholder("SA-8 (Sonance) — descripción técnica profesional pendiente de generar. "), true);
  assert.equal(isDescriptionPlaceholder("Sonance SA-8: solución audiovisual profesional."), true);
  assert.equal(isDescriptionPlaceholder("Potencia [a confirmar] por canal."), true);
  assert.equal(isDescriptionPlaceholder(""), true);
  assert.deepEqual(checkAiDescription("   "), { ok: false, reason: "empty" });
  assert.deepEqual(checkAiDescription("Sonance SA-8: solución audiovisual profesional."), { ok: false, reason: "placeholder" });
});

test("para limpiar datos: vacío no cuenta como inservible, negativa y relleno sí", () => {
  assert.equal(isUnusableAiDescription(null), false);
  assert.equal(isUnusableAiDescription(""), false);
  assert.equal(isUnusableAiDescription("No hay datos disponibles."), true);
  assert.equal(isUnusableAiDescription("Sonance SA-8: solución audiovisual profesional."), true);
  assert.equal(isUnusableAiDescription("Amplificador de ocho canales para audio distribuido."), false);
});
