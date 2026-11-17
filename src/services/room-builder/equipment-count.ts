/**
 * Cuántos equipos tiene un ambiente. Un solo criterio para la web del
 * proyecto (/p/[token]), las láminas PDF y el panel:
 *
 *   equipos = suma de las CANTIDADES de los equipos del ambiente
 *             (6 parlantes iguales en una fila = 6 equipos), sin cables y sin
 *             los equipos del rack central que alimentan al ambiente.
 *
 * El rack central suma una sola vez, en el total del proyecto.
 *
 * Antes la web contaba filas de la lista (con el rack central adentro) y la
 * planta del PDF contaba unidades dibujadas: "Living · 10 equipos" contra
 * "15 eq." para la misma sala.
 */

export interface CountableDevice {
  quantity: number;
  /** Equipo del rack central que alimenta al ambiente. */
  remote?: boolean;
}

export function roomEquipmentUnits(devices: CountableDevice[]): number {
  return devices.filter((d) => !d.remote).reduce((acc, d) => acc + Math.max(1, Math.round(d.quantity || 1)), 0);
}

/**
 * Total del proyecto: cada ambiente (por sus repeticiones, ej. 3 dormitorios
 * iguales) más el rack central una sola vez.
 */
export function projectEquipmentUnits(rooms: Array<{ units: number; repeat?: number }>, centralUnits: number): number {
  return rooms.reduce((acc, r) => acc + r.units * Math.max(1, r.repeat ?? 1), 0) + Math.max(0, centralUnits);
}

/** Equipos del rack central vistos desde los ambientes, sin repetir el mismo equipo. */
export function centralEquipmentUnits(devices: Array<CountableDevice & { deviceId: string }>): number {
  const seen = new Map<string, number>();
  for (const d of devices) if (d.remote && !seen.has(d.deviceId)) seen.set(d.deviceId, Math.max(1, Math.round(d.quantity || 1)));
  return [...seen.values()].reduce((a, n) => a + n, 0);
}
