import Link from "next/link";
import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { SettingField, SettingsCard } from "@/components/admin/setting-field";

export const metadata = { title: "Admin · Configuración general" };

const KEYS = ["app.name", "app.currency", "visibility.default_show_all"];

export default async function SettingsGeneralPage() {
  await requirePermission("settings.manage");
  const rows = await prisma.adminSetting.findMany({ where: { key: { in: KEYS } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/general" />

      <SettingsCard title="Identidad del portal" description="Cómo se llama y en qué moneda opera la plataforma.">
        <SettingField
          settingKey="app.name"
          label="Nombre del portal"
          hint="Aparece en el sidebar, los títulos y los mails."
          value={map.get("app.name") || ""}
          placeholder="Soundtec"
        />
        <SettingField
          settingKey="app.currency"
          label="Moneda por defecto"
          hint="Moneda en la que se expresan los precios de lista."
          value={map.get("app.currency") || ""}
          options={[
            { value: "USD", label: "USD — Dólar estadounidense" },
            { value: "ARS", label: "ARS — Peso argentino" },
            { value: "EUR", label: "EUR — Euro" },
          ]}
        />
      </SettingsCard>

      <SettingsCard
        title="Visibilidad de catálogo"
        description="Qué ve un cliente nuevo antes de definirle reglas propias."
      >
        <SettingField
          settingKey="visibility.default_show_all"
          label="Mostrar todo el catálogo por defecto"
          hint="Si lo desactivás, un cliente sin reglas configuradas no ve ningún producto."
          value={map.get("visibility.default_show_all") || "true"}
          options={[
            { value: "true", label: "Sí — ve todo el catálogo" },
            { value: "false", label: "No — sólo lo que se le habilite" },
          ]}
        />
      </SettingsCard>

      <p className="muted-text">
        Las excepciones por cliente se definen en{" "}
        <Link href="/admin/visibility" className="font-medium text-primary underline">
          Visibilidad por cliente
        </Link>
        .
      </p>
    </div>
  );
}
