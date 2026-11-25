import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "campanas", href: "/admin/mailing", label: "Campañas" },
  { key: "enviados", href: "/admin/mailing/enviados", label: "Enviados" },
  { key: "listas", href: "/admin/mailing/listas", label: "Listas" },
  { key: "plantillas", href: "/admin/mailing/plantillas", label: "Plantillas" },
  { key: "bajas", href: "/admin/mailing/bajas", label: "Bajas y rebotes" },
  { key: "configuracion", href: "/admin/mailing/configuracion", label: "Configuración" },
] as const;

export type MailingTab = (typeof TABS)[number]["key"];

/** Solapas del módulo y, si está en modo prueba, el aviso de que nada sale de verdad. */
export function MailingNav({ active, simulate }: { active: MailingTab; simulate?: { reason: "setting" | "no_key" | null } | null }) {
  return (
    <div className="space-y-3">
      <nav aria-label="Campañas por mail" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.key === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {simulate ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <b>Modo prueba:</b> {simulate.reason === "no_key" ? "todavía no está cargada la API key de Resend, así que" : "está activado «solo simular», así que"} los envíos se registran como
            simulados y no le llega nada a nadie.{" "}
            <Link href="/admin/mailing/configuracion" className="font-semibold underline">
              Configuración
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
