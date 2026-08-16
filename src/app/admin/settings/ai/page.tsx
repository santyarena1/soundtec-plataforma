import { requirePermission } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { SettingField, SettingsCard } from "@/components/admin/setting-field";
import { AiPromptsForm } from "@/components/admin/ai-prompts-form";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Admin · Prompts y modelos de IA" };

export default async function SettingsAiPage() {
  await requirePermission("ai.manage");

  const [
    longDescription,
    shortDescription,
    classification,
    columnMapping,
    requestResponse,
    defaultModel,
    writerModel,
    visionModel,
  ] = await Promise.all([
    getSetting("ai.prompt.long_description", ""),
    getSetting("ai.prompt.short_description", ""),
    getSetting("ai.prompt.classification", ""),
    getSetting("ai.prompt.column_mapping", ""),
    getSetting("ai.prompt.request_response", ""),
    getSetting("openai.model", ""),
    getSetting("quotes.ai.writer_model", ""),
    getSetting("quotes.ai.vision_model", ""),
  ]);

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        href="/admin/settings/ai"
        actions={
          <ButtonLink href="/admin/feedback" variant="outline" size="sm">
            Ver feedback de usuarios
          </ButtonLink>
        }
      />

      <SettingsCard title="Modelos" description="Qué modelo usa cada función. Las claves se cargan en Integraciones.">
        <SettingField
          settingKey="openai.model"
          label="Modelo por defecto"
          hint="Se usa en catálogo, clasificación e importaciones."
          value={defaultModel || "gpt-4o-mini"}
          options={[
            { value: "gpt-4o-mini", label: "gpt-4o-mini — rápido y económico" },
            { value: "gpt-4o", label: "gpt-4o — equilibrado" },
            { value: "gpt-4.1", label: "gpt-4.1 — máxima calidad" },
            { value: "gpt-4-turbo", label: "gpt-4-turbo" },
          ]}
        />
        <SettingField
          settingKey="quotes.ai.writer_model"
          label="Redactor de cotizaciones"
          hint="Dejalo vacío para usar el modelo por defecto."
          value={writerModel}
          options={[
            { value: "", label: "Usar el modelo por defecto" },
            { value: "gpt-4o-mini", label: "gpt-4o-mini" },
            { value: "gpt-4o", label: "gpt-4o" },
            { value: "gpt-4.1", label: "gpt-4.1" },
          ]}
        />
        <SettingField
          settingKey="quotes.ai.vision_model"
          label="Lectura de planos"
          hint="Necesita un modelo con visión."
          value={visionModel}
          options={[
            { value: "", label: "Usar el modelo por defecto" },
            { value: "gpt-4o", label: "gpt-4o" },
            { value: "gpt-4.1", label: "gpt-4.1" },
          ]}
        />
      </SettingsCard>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Prompts de sistema</h3>
            <p className="muted-text mt-0.5">
              Uno por función. Si dejás un prompt vacío, se usa el que trae el sistema por defecto.
            </p>
          </div>
          <AiPromptsForm
            prompts={{ longDescription, shortDescription, classification, columnMapping, requestResponse }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
