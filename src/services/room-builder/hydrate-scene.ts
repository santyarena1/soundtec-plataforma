import { getRoomTemplate } from "./templates";
import { buildSceneFromTemplate, type RoomScene, type SceneDevice } from "./scene";
import { layoutSlotsForScene, relayoutSceneAnchors } from "./slot-layout";
import { normalizeSceneUnits } from "./units";

function finitePositive(n: unknown, min: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min;
}

/**
 * Repara escenas viejas/corruptas:
 * - metros inválidos → dims del template
 * - re-ancla poses
 * - asegura un device por slot (conserva productId si existía)
 */
export function hydrateRoomScene(
  raw: RoomScene | null,
  meta: {
    templateKey: string;
    widthM?: number;
    depthM?: number;
    heightM?: number;
    /** true = volver al layout del template (botón Reparar). */
    force?: boolean;
  },
): { scene: RoomScene; changed: boolean; rebuilt: boolean } {
  const template = getRoomTemplate(meta.templateKey);
  let rebuilt = false;
  let changed = false;

  let scene: RoomScene;
  if (raw && raw.version === 1 && Array.isArray(raw.slots) && Array.isArray(raw.devices)) {
    scene = { ...raw, slots: [...raw.slots], devices: [...raw.devices] };
  } else if (template) {
    scene = buildSceneFromTemplate(template);
    rebuilt = true;
    changed = true;
  } else {
    throw new Error(`Template desconocido: ${meta.templateKey}`);
  }

  if (!scene.templateKey) {
    scene.templateKey = meta.templateKey;
    changed = true;
  }

  const widthOk = finitePositive(scene.widthM, 1.5);
  const depthOk = finitePositive(scene.depthM, 1.5);
  const heightOk = finitePositive(scene.heightM, 2.2);

  if (!widthOk || !depthOk || !heightOk) {
    const widthM =
      (finitePositive(meta.widthM, 1.5) ? meta.widthM : null) ??
      template?.widthM ??
      4;
    const depthM =
      (finitePositive(meta.depthM, 1.5) ? meta.depthM : null) ??
      template?.depthM ??
      3;
    const heightM =
      (finitePositive(meta.heightM, 2.2) ? meta.heightM : null) ??
      template?.heightM ??
      2.7;
    scene = {
      ...scene,
      widthM,
      depthM,
      heightM,
      areaM2: Math.round(widthM * depthM * 100) / 100,
    };
    changed = true;
    rebuilt = true;
  }

  // Snapshot de productos por slot antes de re-anclar
  const bySlot = new Map<string, SceneDevice>();
  for (const d of scene.devices) bySlot.set(d.slotKey, d);

  const laid = relayoutSceneAnchors(scene, { onlyInvalid: !meta.force });
  scene = laid.scene;
  if (laid.changed) changed = true;

  const inside = (pose: SceneDevice["pose"]) =>
    [pose.x, pose.y, pose.z].every((n) => Number.isFinite(n)) &&
    Math.abs(pose.x) <= scene.widthM / 2 + 1.2 &&
    Math.abs(pose.z) <= scene.depthM / 2 + 1.2 &&
    pose.y >= -0.4 &&
    pose.y <= scene.heightM + 0.5;

  // Asegurar device por cada slot, conservando producto y la pose si el usuario la movió
  const devices: SceneDevice[] = scene.slots.map((slot) => {
    const prev = bySlot.get(slot.key);
    if (prev) {
      const pose = !meta.force && inside(prev.pose) ? prev.pose : { ...slot.pose };
      return {
        ...prev,
        label: slot.label,
        designRole: slot.role,
        pose,
        quantity: prev.quantity || slot.defaultQty,
      };
    }
    changed = true;
    return {
      id: `slot-${slot.key}`,
      slotKey: slot.key,
      productId: null,
      designRole: slot.role,
      label: slot.label,
      quantity: slot.defaultQty,
      pose: { ...slot.pose },
      coverage: null,
      productName: null,
      brandName: null,
    };
  });

  if (devices.length !== scene.devices.length) changed = true;
  scene = { ...scene, devices };

  if (!scene.selectedSlotKey || !scene.slots.some((s) => s.key === scene.selectedSlotKey)) {
    scene = {
      ...scene,
      selectedSlotKey: scene.slots[0]?.key ?? null,
    };
    changed = true;
  }

  // cameraPreset inválido
  const allowed = new Set([
    "general",
    "eye",
    "cinema",
    "front_av",
    "plan",
    "detail",
    "device_pov",
  ]);
  if (!allowed.has(scene.cameraPreset)) {
    scene = { ...scene, cameraPreset: "general" };
    changed = true;
  }

  // Unidades físicas coherentes con la cantidad (se reparten las no ubicadas a mano).
  scene = normalizeSceneUnits(meta.force ? { ...scene, devices: scene.devices.map((d) => ({ ...d, units: [] })) } : scene);
  return { scene, changed, rebuilt };
}

/** Rehace la escena desde el template actual, conservando productos por slot. */
export function rebuildSceneKeepingProducts(
  current: RoomScene,
  templateKey: string,
): RoomScene {
  const template = getRoomTemplate(templateKey);
  if (!template) throw new Error(`Template desconocido: ${templateKey}`);

  const widthOk = finitePositive(current.widthM, 1.5);
  const depthOk = finitePositive(current.depthM, 1.5);
  const dims = {
    widthM: widthOk && depthOk ? current.widthM : template.widthM,
    depthM: widthOk && depthOk ? current.depthM : template.depthM,
    heightM: finitePositive(current.heightM, 2.2) ? current.heightM : template.heightM,
  };
  // Con relevamiento, la plantilla se arma con sus respuestas (no vuelve lo que se sacó).
  const brief = current.brief ?? null;
  const next: RoomScene = {
    ...buildSceneFromTemplate({ ...template, slots: layoutSlotsForScene(template.key, dims, brief) }),
    ...dims,
    areaM2: Math.round(dims.widthM * dims.depthM * 100) / 100,
    brief,
  };

  const bySlot = new Map(current.devices.map((d) => [d.slotKey, d]));
  next.devices = next.devices.map((d) => {
    const prev = bySlot.get(d.slotKey);
    if (!prev) return d;
    return {
      ...d,
      productId: prev.productId,
      productName: prev.productName,
      brandName: prev.brandName,
      coverage: prev.coverage,
      quantity: prev.quantity || d.quantity,
      proxyKey: prev.proxyKey,
    };
  });
  // Los equipos agregados a mano (o desde la cadena) no son de la plantilla: se conservan tal cual.
  const kept = (key: string) => key.startsWith("custom_") || key.startsWith("bom_");
  next.slots = [...next.slots, ...current.slots.filter((s) => kept(s.key))];
  next.devices = [...next.devices, ...current.devices.filter((d) => kept(d.slotKey))];
  next.selectedSlotKey =
    current.selectedSlotKey &&
    next.slots.some((s) => s.key === current.selectedSlotKey)
      ? current.selectedSlotKey
      : next.slots[0]?.key ?? null;
  next.cameraPreset = current.cameraPreset || "general";
  next.coverageView = current.coverageView || "zones";
  next.plan = current.plan ?? null;
  next.planUnderlay = current.planUnderlay ?? null;
  if (current.plan?.enabled) next.areaM2 = current.areaM2;
  return next;
}
