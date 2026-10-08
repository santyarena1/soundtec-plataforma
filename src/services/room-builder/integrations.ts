/**
 * Reglas de integración con sistemas de control (editables en Admin).
 * Acá viven el tipo, cómo se elige la regla que aplica a un producto y la
 * precarga inicial (marcada "a confirmar").
 */

export const CONTROL_PLATFORMS = ["crestron-home", "crestron-pro"] as const;
export type ControlPlatform = (typeof CONTROL_PLATFORMS)[number];

export const INTEGRATION_METHODS = ["native", "driver-ip", "rs232", "ir", "relay", "none"] as const;
export type IntegrationMethod = (typeof INTEGRATION_METHODS)[number];

export const METHOD_LABELS: Record<IntegrationMethod, string> = {
  native: "Nativo",
  "driver-ip": "Driver por red (IP)",
  rs232: "Serie RS-232",
  ir: "Infrarrojo",
  relay: "Contacto / relé",
  none: "No se integra",
};

export const PLATFORM_LABELS: Record<ControlPlatform, string> = {
  "crestron-home": "Crestron Home",
  "crestron-pro": "Crestron programado",
};

export type IntegrationRule = {
  id?: string;
  brandSlug: string;
  productMatch: string | null;
  platform: ControlPlatform;
  method: IntegrationMethod;
  requirement: string | null;
  needsNetwork: boolean;
  verified: boolean;
  notes: string | null;
};

/**
 * Regla que aplica a un producto: misma marca y plataforma; gana la que
 * tiene el texto de modelo más largo contenido en el nombre; si ninguna,
 * la general de la marca.
 */
export function findIntegration(
  rules: IntegrationRule[],
  brandSlug: string | null | undefined,
  productName: string,
  platform: ControlPlatform,
): IntegrationRule | null {
  if (!brandSlug) return null;
  const name = productName.toLowerCase();
  const candidates = rules.filter((r) => r.brandSlug === brandSlug && r.platform === platform);
  const specific = candidates
    .filter((r) => r.productMatch && name.includes(r.productMatch.toLowerCase()))
    .sort((a, b) => (b.productMatch?.length ?? 0) - (a.productMatch?.length ?? 0));
  return specific[0] ?? candidates.find((r) => !r.productMatch) ?? null;
}

const both = (rule: Omit<IntegrationRule, "platform">): IntegrationRule[] =>
  CONTROL_PLATFORMS.map((platform) => ({ ...rule, platform }));

/** Precarga inicial: todo "a confirmar" (verified false). */
export const INTEGRATION_SEED: IntegrationRule[] = [
  ...both({
    brandSlug: "crestron",
    productMatch: null,
    method: "native",
    requirement: "Equipo Crestron: se suma directo al sistema.",
    needsNetwork: true,
    verified: false,
    notes: null,
  }),
  {
    brandSlug: "blaze-by-sonance",
    productMatch: "Connect",
    platform: "crestron-home",
    method: "driver-ip",
    requirement: "Driver de Blaze para Crestron Home; el amplificador va a la red.",
    needsNetwork: true,
    verified: false,
    notes: null,
  },
  {
    brandSlug: "blaze-by-sonance",
    productMatch: "Connect",
    platform: "crestron-pro",
    method: "driver-ip",
    requirement: "Módulo de control de Blaze por red para el procesador Crestron.",
    needsNetwork: true,
    verified: false,
    notes: null,
  },
  ...both({
    brandSlug: "blaze-by-sonance",
    productMatch: null,
    method: "none",
    requirement: "Los PowerZone sin 'Connect' no se controlan por red: encendido por señal.",
    needsNetwork: false,
    verified: false,
    notes: "Para control, elegir un modelo PowerZone Connect.",
  }),
  ...both({
    brandSlug: "sonance",
    productMatch: null,
    method: "none",
    requirement: "Amplificadores Sonance: encendido automático por señal; el volumen se maneja desde la fuente.",
    needsNetwork: false,
    verified: false,
    notes: null,
  }),
  ...both({
    brandSlug: "bluesound-professional",
    productMatch: null,
    method: "driver-ip",
    requirement: "Driver BluOS para Crestron; reproductor en la red.",
    needsNetwork: true,
    verified: false,
    notes: null,
  }),
  ...both({
    brandSlug: "atlona",
    productMatch: null,
    method: "driver-ip",
    requirement: "Driver Crestron de Atlona (según modelo).",
    needsNetwork: true,
    verified: false,
    notes: null,
  }),
];
