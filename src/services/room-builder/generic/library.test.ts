import assert from "node:assert/strict";
import { test } from "node:test";
import { devicePorts } from "../device-ports";
import { isDirection, isIoSignal, WIRELESS_PROTOCOLS } from "../io-profile/types";
import { expandIoPorts } from "../wiring/ports";
import { GENERIC_LIBRARY, genericByKey, genericMissing } from "./library";

test("genéricos: claves únicas y puertos válidos del vocabulario", () => {
  const keys = GENERIC_LIBRARY.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const t of GENERIC_LIBRARY) {
    assert.ok(t.ports.length > 0 || t.capabilities.wireless, `${t.key} sin conexiones`);
    for (const p of t.ports) {
      assert.ok(isIoSignal(p.signal) && isDirection(p.direction) && p.count >= 1, `${t.key}: ${p.label}`);
    }
    for (const w of t.capabilities.wireless?.value ?? []) assert.ok((WIRELESS_PROTOCOLS as readonly string[]).includes(w.protocol));
  }
});

test("genéricos: cada plantilla genera puertos individuales cableables y entra al motor", () => {
  for (const t of GENERIC_LIBRARY) {
    const ports = expandIoPorts(t.ports);
    assert.equal(ports.length, t.ports.reduce((a, p) => a + p.count, 0), t.key);
    assert.ok(devicePorts({ ports: t.ports, capabilities: t.capabilities }), t.key);
  }
  const matrix = expandIoPorts(genericByKey("matrix-4x4")!.ports);
  assert.deepEqual(matrix.filter((p) => p.direction === "in" && p.signal === "hdmi").map((p) => p.label), ["HDMI IN 1", "HDMI IN 2", "HDMI IN 3", "HDMI IN 4"]);
});

test("genéricos: precio y descripción a completar para cotizar", () => {
  assert.deepEqual(genericMissing({ key: "tv", name: "TV", description: null, priceUsd: null }), ["precio", "descripción"]);
  assert.deepEqual(genericMissing({ key: "tv", name: "TV", description: "Samsung 65\"", priceUsd: 900 }), []);
  assert.ok(genericByKey("shade-motor"), "motor de cortina");
});
