import assert from "node:assert/strict";
import { test } from "node:test";
import { roomNeeds, type RuleContext } from "./room-rules";

const brief = (control: "crestron-home" | "none", systems: string[] = []) => ({ version: 1, systems, control, vcPlatform: null, audio: null, video: null, brands: {}, tier: "recomendado", notes: null }) as never;
const ctx = (over: Partial<RuleContext>): RuleContext => ({ roomName: "Living", category: "residential", brief: brief("crestron-home"), devices: [], doors: 1, ...over });
const dev = (cls: string, label: string, quantity = 1) => ({ cls, label, quantity, role: "other" });

test("reglas: luz controlada sin teclas pide una tecla por acceso", () => {
  const needs = roomNeeds(ctx({ doors: 2, devices: [dev("other", "Crestron CM2-DIMUEX-RKR-W-S", 3)] }));
  const n = needs.find((x) => x.ruleId === "luces-sin-tecla");
  assert.ok(n);
  assert.equal(n!.quantity, 2);
  assert.equal(n!.generic, "keypad-wired");
});

test("reglas: dormitorio con luz controlada lleva tecla junto a la cama", () => {
  const needs = roomNeeds(ctx({ roomName: "Dormitorio principal", devices: [dev("other", "Crestron CM2-DIMUEX-RKR-W-S"), dev("touch", "Crestron HZ2-KPEX-W")] }));
  assert.ok(needs.some((x) => x.ruleId === "tecla-cama" && x.quantity === 1));
});

test("reglas: audio y TV de una sala controlada sin interfaz piden control; sin control no", () => {
  const room = [dev("speaker", "SONANCE C6R SST", 4), dev("display", "Samsung TV")];
  const needs = roomNeeds(ctx({ devices: room }));
  assert.ok(needs.some((x) => x.ruleId === "audio-sin-control"));
  assert.ok(needs.some((x) => x.ruleId === "video-sin-control" && x.generic === "handheld-remote"));
  assert.equal(roomNeeds(ctx({ brief: brief("none"), devices: room })).length, 0);
});

test("reglas: con tecla y panel no pide nada", () => {
  const needs = roomNeeds(ctx({ devices: [dev("other", "Crestron CM2-DIMUEX-RKR-W-S"), dev("touch", "Crestron HZ2-KPEX-W"), dev("touch", "Crestron TSW-1070-B-S"), dev("speaker", "C6R"), dev("display", "TV")] }));
  assert.equal(needs.length, 0);
});
