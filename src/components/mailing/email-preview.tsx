"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderCampaignEmail, type CampaignFooter } from "@/lib/mailing/template";
import type { MailBlock } from "@/lib/mailing/blocks";
import type { MailContact } from "@/lib/mailing/variables";

/** Vista previa del mail tal como sale (misma plantilla), en ancho de escritorio o de celular. */
export function EmailPreview({ subject, preheader, blocks, footer, contact }: { subject: string; preheader: string; blocks: MailBlock[]; footer: CampaignFooter; contact: MailContact }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const mail = useMemo(() => renderCampaignEmail({ subject, preheader, blocks, contact, unsubscribeUrl: "#baja", footer, origin }), [subject, preheader, blocks, contact, footer, origin]);
  const width = device === "mobile" ? 390 : 680;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Vista previa</h2>
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
      <div className="flex justify-center overflow-hidden rounded-lg bg-[#eef0f3]">
        <iframe title="Vista previa del mail" srcDoc={mail.html} sandbox="" style={{ width, maxWidth: "100%", height: 860, border: 0, background: "#eef0f3" }} />
      </div>
    </section>
  );
}
