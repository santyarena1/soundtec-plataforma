import { test } from "node:test";
import assert from "node:assert/strict";
import { overlapsCount, placeLabels, textWidth } from "./label-layout";

test("rótulos de cables que comparten recorrido: ninguno encimado, a lo largo del cable o con línea guía", () => {
  // Seis cables del rack a la pantalla por el mismo tramo (lo típico del plano técnico).
  const path = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }];
  const labels = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, w: textWidth(`HDMI-00${i} · 7.5 m`, 11, 0.62), h: 14, path }));
  const placed = placeLabels(labels, [], { gap: 2 });
  assert.equal(placed.length, 6);
  assert.equal(overlapsCount(placed), 0);
  // Los primeros quedan junto al cable, sin guía.
  assert.ok(placed.slice(0, 4).every((p) => p.leader === null));
});

test("rótulos de equipos: junto a su equipo, sin tapar el cuerpo de otro equipo ni encimarse", () => {
  const devices = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 60, y: 0 },
  ];
  const bodies = devices.map((d) => ({ ...d, w: 26, h: 26 }));
  const placed = placeLabels(
    devices.map((d, i) => ({ id: `d${i}`, w: textWidth("Pantalla 75 pulgadas", 11), h: 14, path: [d] })),
    bodies,
    { gap: 2, reach: () => 26 },
  );
  assert.equal(overlapsCount([...placed, ...bodies]), 0);
  // Cada rótulo queda cerca de su equipo (a lo sumo unos pocos renglones).
  placed.forEach((p, i) => assert.ok(Math.hypot(p.x - devices[i]!.x, p.y - devices[i]!.y) < 200));
});
