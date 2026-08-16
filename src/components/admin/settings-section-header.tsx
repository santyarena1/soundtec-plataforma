import type { ReactNode } from "react";
import { findSettingsSection } from "@/lib/settings-sections";

interface Props {
  /** Href de la sección; el título y la descripción salen del mapa de configuración. */
  href: string;
  actions?: ReactNode;
}

export function SettingsSectionHeader({ href, actions }: Props) {
  const section = findSettingsSection(href);
  if (!section) return null;

  return (
    <div data-tour="page-header" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary">
          <section.icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="heading-3">{section.label}</h2>
          <p className="muted-text mt-0.5 max-w-xl">{section.description}</p>
        </div>
      </div>
      {actions ? (
        <div data-tour="page-actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
