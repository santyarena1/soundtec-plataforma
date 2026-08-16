import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { SettingField, SettingsCard } from "@/components/admin/setting-field";

export const metadata = { title: "Admin · Integraciones y claves" };

const REQUIRED_KEYS = [
  {
    key: "openai.api_key",
    label: "OpenAI",
    hint: "Imprescindible: redacción de cotizaciones, lectura de planos y generación de esquemas conceptuales.",
  },
  {
    key: "serper.api_key",
    label: "Serper",
    hint: "Búsqueda de fotos reales de producto. El vendedor elige cuáles usar; nunca se insertan solas.",
  },
];

const OPTIONAL_KEYS = [
  {
    key: "images.api_key",
    label: "Imágenes",
    hint: "Si queda vacía se usa la clave de OpenAI.",
  },
  {
    key: "anthropic.api_key",
    label: "Anthropic",
    hint: "Reserva para usar Claude como redactor alternativo.",
  },
  {
    key: "gemini.api_key",
    label: "Google Gemini",
    hint: "También se puede definir por entorno con GEMINI_API_KEY.",
  },
  {
    key: "higgsfield.api_key",
    label: "Higgsfield",
    hint: "Sólo si cambiás el proveedor de esquemas a Higgsfield.",
  },
];

export default async function SettingsIntegrationsPage() {
  await requirePermission("api_keys.manage");
  const keys = [...REQUIRED_KEYS, ...OPTIONAL_KEYS].map((k) => k.key);
  const rows = await prisma.adminSetting.findMany({ where: { key: { in: [...keys, "images.provider"] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/integrations" />

      <SettingsCard
        title="Claves necesarias"
        description="Sin estas dos, el copiloto de cotizaciones funciona en modo simulado."
      >
        {REQUIRED_KEYS.map((k) => (
          <SettingField
            key={k.key}
            settingKey={k.key}
            label={k.label}
            hint={k.hint}
            value={map.get(k.key) || ""}
            placeholder="sk-..."
            secret
          />
        ))}
      </SettingsCard>

      <SettingsCard title="Claves opcionales" description="Proveedores alternativos o de reserva.">
        {OPTIONAL_KEYS.map((k) => (
          <SettingField
            key={k.key}
            settingKey={k.key}
            label={k.label}
            hint={k.hint}
            value={map.get(k.key) || ""}
            placeholder="sk-..."
            secret
          />
        ))}
      </SettingsCard>

      <SettingsCard title="Proveedor de esquemas" description="Quién genera los esquemas conceptuales de instalación.">
        <SettingField
          settingKey="images.provider"
          label="Proveedor"
          value={map.get("images.provider") || "openai"}
          options={[
            { value: "openai", label: "OpenAI" },
            { value: "higgsfield", label: "Higgsfield" },
            { value: "none", label: "Desactivado" },
          ]}
        />
      </SettingsCard>
    </div>
  );
}
