/**
 * Reglas de integrador por ambiente: lo que un integrador siempre agrega
 * aunque nadie lo pida (una tecla en cada acceso si la luz está controlada,
 * otra junto a la cama, un control para las cortinas o el audio de la zona…).
 * Cada regla dice cuándo aplica, qué falta y con qué se resuelve; la solución
 * se elige del catálogo (filtrada por la plataforma de control).
 */

import type { RoomBrief } from "./brief";
import type { DeviceCablingProfile } from "./cabling-db";
import type { RoomScene } from "./scene";

export type RuleDevice = { cls: string; label: string; quantity: number; role: string };
export type RuleContext = {
  roomName: string;
  category: string;
  brief: RoomBrief | null;
  devices: RuleDevice[];
  /** Puertas del ambiente (del plano); 1 si no se sabe. */
  doors: number;
};
export type RuleNeed = { ruleId: string; title: string; detail: string; generic: string; quantity: number };

const has = (ctx: RuleContext, re: RegExp, cls?: string[]) => ctx.devices.filter((d) => (cls ? cls.includes(d.cls) : true) && re.test(d.label)).reduce((a, d) => a + d.quantity, 0);
const LIGHTING = /\bDIM|dimmer|lighting|ilumin|CLX-|DIN-\d?DIM|LDIM|\bSW(EX)?\b|SWEX|LED/i;
const SHADES = /cortina|shade|persiana|\bQMT|roller shade/i;
const KEYPAD = /\bKP|keypad|teclado|KPEX|KPCN|C2N-CB|HZ2-K|CM2-K|\bCBD/i;
const TOUCH = /\bTSW|\bTS-|\bTST|touch|t[aá]ctil|panel/i;
const REMOTE = /\bHR-|\bTSR-|remote|control remoto/i;
const BEDROOM = /dormitorio|habitaci[oó]n|suite|bedroom|cuarto/i;

const interfaces = (ctx: RuleContext) => has(ctx, KEYPAD) + has(ctx, TOUCH, ["touch", "control", "other"]) + has(ctx, REMOTE);
const controlled = (ctx: RuleContext) => (ctx.brief?.control ?? "none") !== "none";
const lightingCount = (ctx: RuleContext) => has(ctx, LIGHTING, ["control", "other"]);

type RoomRule = { id: string; check: (ctx: RuleContext) => RuleNeed | null };

export const ROOM_RULES: RoomRule[] = [
  {
    id: "luces-sin-tecla",
    check: (ctx) => {
      const lights = lightingCount(ctx) || (ctx.brief?.systems.includes("lighting") ? 1 : 0);
      if (!lights || has(ctx, KEYPAD) + has(ctx, TOUCH, ["touch", "control", "other"]) > 0) return null;
      return { ruleId: "luces-sin-tecla", title: "Iluminación controlada sin teclas", detail: `${ctx.roomName}: la iluminación está automatizada y no hay ninguna tecla para encenderla ni para las escenas.`, generic: "keypad-wired", quantity: Math.max(1, ctx.doors) };
    },
  },
  {
    id: "tecla-por-acceso",
    check: (ctx) => {
      const keypads = has(ctx, KEYPAD);
      if (!lightingCount(ctx) || !keypads || ctx.doors <= 1 || keypads >= ctx.doors) return null;
      return { ruleId: "tecla-por-acceso", title: "Falta una tecla en cada acceso", detail: `${ctx.roomName} tiene ${ctx.doors} accesos y ${keypads} tecla(s): cada entrada lleva su tecla de escenas.`, generic: "keypad-wired", quantity: ctx.doors - keypads };
    },
  },
  {
    id: "tecla-cama",
    check: (ctx) => {
      if (!BEDROOM.test(`${ctx.roomName} ${ctx.category}`) || !(lightingCount(ctx) || ctx.brief?.systems.includes("lighting"))) return null;
      const keypads = has(ctx, KEYPAD);
      if (keypads >= Math.max(1, ctx.doors) + 1) return null;
      return { ruleId: "tecla-cama", title: "Falta la tecla junto a la cama", detail: `${ctx.roomName}: en un dormitorio va una tecla en el acceso y otra junto a la cama (apagar todo, escenas de noche).`, generic: "keypad-wired", quantity: Math.max(1, ctx.doors) + 1 - keypads };
    },
  },
  {
    id: "cortinas-sin-control",
    check: (ctx) => {
      if (!(has(ctx, SHADES) || ctx.brief?.systems.includes("shades")) || interfaces(ctx) > 0) return null;
      return { ruleId: "cortinas-sin-control", title: "Cortinas sin control", detail: `${ctx.roomName}: hay cortinas motorizadas y ninguna tecla o panel para subirlas y bajarlas.`, generic: "keypad-wired", quantity: 1 };
    },
  },
  {
    id: "audio-sin-control",
    check: (ctx) => {
      const speakers = ctx.devices.filter((d) => d.cls === "speaker" || d.cls === "subwoofer").length;
      if (!speakers || !controlled(ctx) || interfaces(ctx) > 0) return null;
      return { ruleId: "audio-sin-control", title: "Audio de la zona sin control", detail: `${ctx.roomName}: la zona de audio no tiene tecla, panel ni control para volumen y fuente (además de la app).`, generic: "keypad-wired", quantity: 1 };
    },
  },
  {
    id: "video-sin-control",
    check: (ctx) => {
      const displays = ctx.devices.filter((d) => d.cls === "display").length;
      if (!displays || !controlled(ctx) || has(ctx, TOUCH, ["touch", "control", "other"]) + has(ctx, REMOTE) > 0) return null;
      return { ruleId: "video-sin-control", title: "TV sin control del sistema", detail: `${ctx.roomName}: la TV está integrada al control y no hay control remoto ni panel del sistema.`, generic: "handheld-remote", quantity: 1 };
    },
  },
];

/** Contexto de reglas de un ambiente a partir de su escena y su perfil de cableado. */
export function ruleContext(scene: RoomScene, roomName: string, category: string, devices: Record<string, DeviceCablingProfile>): RuleContext {
  const list: RuleDevice[] = scene.devices
    .filter((d) => d.productId || d.generic)
    .map((d) => {
      const info = devices[d.id];
      return { cls: info?.cls ?? "other", label: `${info?.label ?? ""} ${d.productName ?? ""} ${d.label}`, quantity: Math.max(1, d.quantity || 1), role: d.designRole };
    });
  const doors = scene.plan?.openings?.filter((o) => o.kind === "door").length ?? 0;
  return { roomName, category, brief: scene.brief ?? null, devices: list, doors: Math.max(1, doors) };
}

export function roomNeeds(ctx: RuleContext): RuleNeed[] {
  return ROOM_RULES.map((r) => r.check(ctx)).filter((n): n is RuleNeed => Boolean(n));
}
