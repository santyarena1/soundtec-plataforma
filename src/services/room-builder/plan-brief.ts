/**
 * Equipos de cada ambiente de un plano, compartido por la pantalla (resumen
 * "qué se va a instalar") y el servidor (generación): lo que se muestra es
 * exactamente lo que se crea.
 */

import { initialBrief } from "@/components/room-builder/wizard/wizard-data";
import type { BrandGroup, BriefControl, BriefSystem, BriefTier, BriefVcPlatform, RoomBrief } from "./brief";
import { layoutSlotsForScene } from "./slot-layout";

export type PlanCommon = {
  control: BriefControl;
  vcPlatform: BriefVcPlatform | null;
  tier: BriefTier;
  brands: Partial<Record<BrandGroup, string[]>>;
};

/** Sistemas que necesitan un control para existir. */
const NEEDS_CONTROL = new Set<BriefSystem>(["control", "lighting", "shades"]);

/** Sistemas por defecto del ambiente según su tipo y el control elegido para la obra. */
export function defaultPlanSystems(category: string, templateKey: string, control: BriefControl): BriefSystem[] {
  const base = initialBrief(category, templateKey).systems;
  const systems = control !== "none" ? [...new Set([...base, "control" as const])] : base.filter((s) => !NEEDS_CONTROL.has(s));
  return systems.length ? systems : ["audio"];
}

/**
 * Respuestas del asistente para un ambiente, con lo común del proyecto.
 * `systems`: lo que eligió el usuario para este ambiente (si no, los de su tipo).
 */
export function briefForPlanRoom(category: string, templateKey: string, common: PlanCommon, centralized: RoomBrief["centralized"] = null, systems?: BriefSystem[] | null): RoomBrief {
  const base = initialBrief(category, templateKey);
  const wantsControl = common.control !== "none";
  const chosen = systems?.length ? systems : defaultPlanSystems(category, templateKey, common.control);
  // Sin control en la obra no hay iluminación ni cortinas controladas.
  const final = wantsControl ? chosen : chosen.filter((s) => !NEEDS_CONTROL.has(s));
  const list = final.length ? final : ["audio" as const];
  return {
    ...base,
    systems: list,
    control: wantsControl && list.includes("control") ? common.control : "none",
    vcPlatform: list.includes("vc") ? (common.vcPlatform ?? base.vcPlatform ?? "teams") : null,
    tier: common.tier,
    brands: common.brands,
    centralized,
  };
}

export type PlannedEquipment = { key: string; label: string; role: string; qty: number; required: boolean };

/** Lo que se va a instalar en el ambiente (tipo de equipo y cantidad), igual que al generarlo. */
export function plannedEquipment(templateKey: string, dims: { widthM: number; depthM: number; heightM: number; areaM2?: number }, brief: RoomBrief): PlannedEquipment[] {
  return layoutSlotsForScene(templateKey, dims, brief)
    .filter((s) => s.required)
    .map((s) => ({ key: s.key, label: s.label, role: s.role, qty: Math.max(1, s.defaultQty ?? 1), required: s.required }));
}
