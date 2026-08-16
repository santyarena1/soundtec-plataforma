"use client";

import { LiveQuoteCanvas, type LiveModule } from "@/components/quotes/live-quote-canvas";
import type { ImagePlacement } from "@/lib/quote-defaults";

export type TemplateModule = {
  key: string;
  kind: "fixed" | "ai" | "table";
  title: string;
  description: string;
  blockId: string | null;
  body: string;
};

export type TemplateIdentity = {
  name: string;
  primary: string;
  logoUrl: string;
  headerUrl: string;
  brandsUrl: string;
  isoUrl: string;
  brands?: ImagePlacement | null;
  iso?: ImagePlacement | null;
};

export function QuoteTemplateEditor({
  modules,
  identity,
}: {
  modules: TemplateModule[];
  identity: TemplateIdentity;
}) {
  const liveModules: LiveModule[] = modules.map((mod) => ({
    key: mod.key,
    kind: mod.kind,
    title: mod.title,
    description: mod.description,
    body: mod.body,
    persistId: mod.blockId,
  }));

  return (
    <LiveQuoteCanvas
      scope="template"
      identity={identity}
      header={{
        dateLabel: "Buenos Aires, 15 de agosto de 2026",
        clientName: "Cliente de ejemplo S.A.",
        contactName: "Nombre del contacto",
        reference: "Sistema de sonido ambiental — sala de reuniones",
        number: "COT14544",
      }}
      modules={liveModules}
      signature={{ name: "Nombre de quien firma", title: "Cargo" }}
      canEditImages
    />
  );
}
