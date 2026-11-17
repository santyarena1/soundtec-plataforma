"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderCampaignEmail, type CampaignFooter } from "@/lib/mailing/template";
import { finalizeCustomHtml } from "@/lib/mailing/html-finalize";
import { fillVariables } from "@/lib/mailing/variables";
import type { MailBlock } from "@/lib/mailing/blocks";
import type { MailContact } from "@/lib/mailing/variables";

/** Vista previa del mail tal como sale (misma plantilla), en ancho de escritorio o de celular. */
export function EmailPreview({ subject, preheader, blocks, footer, contact, customHtml, title = "Vista previa", height = 860 }: { subject: string; preheader: string; blocks: MailBlock[]; footer: CampaignFooter; contact: MailContact; /** HTML propio (modo HTML): reemplaza a los bloques. */ customHtml?: string | null; title?: string; height?: number }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const mail = useMemo(
    () =>
      customHtml != null
        ? { subject: fillVariables(subject.trim() || "(sin asunto)", contact), html: finalizeCustomHtml({ html: customHtml, contact, preheader, unsubscribeUrl: "#baja", footer }) }
        : renderCampaignEmail({ subject, preheader, blocks, contact, unsubscribeUrl: "#baja", footer, origin }),
    [subject, preheader, blocks, contact, footer, origin, customHtml]
  );
  const width = device === "mobile" ? 390 : 680;
  const frameBox = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = frameBox.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = boxWidth > 0 && boxWidth < width ? boxWidth / width : 1;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div role="tablist" className="inline-flex rounded-lg border border-border p-0.5">
          {(
            [
              { key: "desktop", label: "Escritorio", icon: Monitor },
              { key: "mobile", label: "Celular", icon: Smartphone },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={device === key}
              onClick={() => setDevice(key)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium", device === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
        <p className="truncate">
          <span className="font-semibold">{mail.subject}</span>
          {preheader ? <span className="text-muted-foreground"> — {preheader}</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">Así le llega a {contact.name || contact.email}{contact.company ? ` (${contact.company})` : ""}</p>
      </div>
      <div ref={frameBox} className="flex justify-center overflow-hidden rounded-lg bg-[#eef0f3]" style={{ height: height * scale }}>
        {/* Si la columna es más angosta que el ancho simulado, se achica entero (no se recorta un diseño de 600 px). */}
        <iframe title="Vista previa del mail" srcDoc={mail.html} sandbox="" className="shrink-0 origin-top" style={{ width, height, border: 0, background: "#eef0f3", transform: scale < 1 ? `scale(${scale})` : undefined }} />
      </div>
      {scale < 1 ? <p className="text-xs text-muted-foreground">Achicada al {Math.round(scale * 100)} % para que entre en la pantalla.</p> : null}
    </section>
  );
}
