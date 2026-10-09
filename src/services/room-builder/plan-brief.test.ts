import { test } from "node:test";
import assert from "node:assert/strict";
import { briefForPlanRoom, defaultPlanSystems, plannedEquipment } from "./plan-brief";
import { layoutSlotsForScene } from "./slot-layout";

const common = { control: "crestron-home" as const, vcPlatform: null, tier: "recomendado" as const, brands: {} };
const dims = { widthM: 6, depthM: 4.5, heightM: 2.7 };

test("sistemas por defecto: con control de obra se suma control; sin control se quitan control, luces y cortinas", () => {
  assert.ok(defaultPlanSystems("residential", "residential-living-m", "crestron-home").includes("control"));
  const none = defaultPlanSystems("residential", "residential-living-m", "none");
  assert.ok(!none.includes("control") && !none.includes("lighting") && !none.includes("shades"));
});

test("lo elegido por ambiente manda: solo audio no instala pantallas; con video sí", () => {
  const audioOnly = plannedEquipment("residential-living-m", dims, briefForPlanRoom("residential", "residential-living-m", common, null, ["audio"]));
  assert.ok(audioOnly.some((e) => e.role === "speaker"), "lleva parlantes");
  assert.ok(!audioOnly.some((e) => e.role === "display"), "sin pantalla");
  const withVideo = plannedEquipment("residential-living-m", dims, briefForPlanRoom("residential", "residential-living-m", common, null, ["audio", "video"]));
  assert.ok(withVideo.some((e) => e.role === "display"), "con pantalla");
});

test("el resumen es exactamente lo que se genera (mismos equipos obligatorios y cantidades)", () => {
  for (const [cat, key] of [
    ["residential", "residential-living-m"],
    ["videoconference", "vc-meeting-m"],
    ["hotel", "hotel-guest-s"],
  ] as const) {
    const brief = briefForPlanRoom(cat, key, { ...common, control: "crestron-pro", vcPlatform: "teams" });
    const summary = plannedEquipment(key, dims, brief);
    const generated = layoutSlotsForScene(key, dims, brief).filter((s) => s.required);
    assert.deepEqual(
      summary.map((s) => [s.key, s.qty]),
      generated.map((s) => [s.key, Math.max(1, s.defaultQty ?? 1)]),
      key,
    );
  }
});

test("sin control en la obra no quedan controles aunque se hayan marcado", () => {
  const brief = briefForPlanRoom("residential", "residential-living-m", { ...common, control: "none" }, null, ["audio", "control", "lighting"]);
  assert.equal(brief.control, "none");
  assert.deepEqual(brief.systems, ["audio"]);
});
