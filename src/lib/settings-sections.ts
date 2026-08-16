/**
 * Mapa único de la configuración del admin.
 *
 * Toda pantalla de configuración vive bajo /admin/settings/* y se declara acá.
 * El hub, la sub-navegación y el filtrado por permisos leen esta misma lista,
 * así que agregar una sección nueva es agregar una entrada acá + su page.tsx.
 */

import type { ComponentType } from "react";
import {
  FileSpreadsheet,
  KeyRound,
  Palette,
  Percent,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { PermissionScope } from "@/lib/permissions";

export interface SettingsSection {
  href: string;
  label: string;
  /** Se muestra en las tarjetas del hub y como subtítulo de la sección. */
  description: string;
  icon: ComponentType<{ className?: string }>;
  scope: PermissionScope;
}

export interface SettingsSectionGroup {
  title: string;
  items: SettingsSection[];
}

export const SETTINGS_GROUPS: SettingsSectionGroup[] = [
  {
    title: "Plataforma",
    items: [
      {
        href: "/admin/settings/general",
        label: "General",
        description: "Nombre del portal, moneda base y visibilidad de catálogo por defecto.",
        icon: Settings2,
        scope: "settings.manage",
      },
      {
        href: "/admin/settings/branding",
        label: "Marca y apariencia",
        description: "Logo institucional y colores que usa toda la plataforma.",
        icon: Palette,
        scope: "branding.manage",
      },
    ],
  },
  {
    title: "Comercial",
    items: [
      {
        href: "/admin/settings/pricing",
        label: "Precios y moneda",
        description: "Margen global, tipo de cambio de venta y coeficiente de nacionalización.",
        icon: Percent,
        scope: "settings.manage",
      },
      {
        href: "/admin/settings/quotes",
        label: "Cotizaciones",
        description: "Numeración, identidad del documento, condiciones y textos de plantilla.",
        icon: FileSpreadsheet,
        scope: "quotes.manage_library",
      },
    ],
  },
  {
    title: "Inteligencia artificial",
    items: [
      {
        href: "/admin/settings/ai",
        label: "Prompts y modelos",
        description: "Prompt de sistema y modelo asignado a cada función de IA.",
        icon: Sparkles,
        scope: "ai.manage",
      },
    ],
  },
  {
    title: "Accesos",
    items: [
      {
        href: "/admin/settings/integrations",
        label: "Integraciones y claves",
        description: "API keys de OpenAI, Serper y los demás proveedores externos.",
        icon: KeyRound,
        scope: "api_keys.manage",
      },
      {
        href: "/admin/settings/roles",
        label: "Roles y permisos",
        description: "Qué pantallas y acciones puede usar cada rol personalizado.",
        icon: ShieldCheck,
        scope: "roles.manage",
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.items);

export function findSettingsSection(href: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.href === href);
}

/** Rutas de configuración a revalidar cuando se guarda cualquier setting. */
export const SETTINGS_REVALIDATE_PATHS = ["/admin/settings", ...SETTINGS_SECTIONS.map((s) => s.href)];
