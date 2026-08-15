import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { saveSetting } from "@/server/actions/settings";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Admin · API Keys" };

const keys = [
  { key: "openai.api_key", label: "OpenAI API Key", description: "Redacción, visión de planos y generación si el proveedor de imágenes es OpenAI. Vacía = mock." },
  { key: "serper.api_key", label: "Serper API Key", description: "Búsqueda de fotos de producto/aplicación. Vacía = placeholder." },
  { key: "anthropic.api_key", label: "Anthropic API Key", description: "Opcional. Si está, se puede usar como proveedor del copiloto." },
  { key: "gemini.api_key", label: "Google Gemini API Key", description: "Opcional. Visión / redacción. También lee GEMINI_API_KEY del entorno." },
  { key: "images.api_key", label: "API Key de imágenes", description: "Generación de esquemas/conceptuales. Si está vacía no se generan imágenes." },
];

const modelFields = [
  { key: "openai.model", label: "Modelo OpenAI por defecto", options: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4-turbo"] },
  { key: "quotes.ai.writer_model", label: "Modelo redactor de cotizaciones", options: ["", "gpt-4o-mini", "gpt-4o", "gpt-4.1"] },
  { key: "quotes.ai.vision_model", label: "Modelo visión (planos)", options: ["", "gpt-4o", "gpt-4.1"] },
  { key: "images.provider", label: "Proveedor de imágenes", options: ["openai", "none"] },
];

function mask(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default async function AdminApiKeysPage() {
  await requireAdmin();
  const rows = await prisma.adminSetting.findMany({
    where: { key: { in: [...keys.map((k) => k.key), ...modelFields.map((m) => m.key)] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Las claves se guardan en la tabla AdminSetting marcadas como secretas. Para producción es preferible usar variables de entorno y dejar este formulario sólo para overrides."
      />
      <div className="space-y-3">
        {keys.map((k) => {
          const value = map.get(k.key) || "";
          return (
            <Card key={k.key}>
              <CardContent className="p-5">
                <form action={saveSetting} className="space-y-2">
                  <input type="hidden" name="key" value={k.key} />
                  <input type="hidden" name="isSecret" value="true" />
                  <div className="flex items-center justify-between">
                    <Label htmlFor={k.key}>{k.label}</Label>
                    {value ? <Badge tone="success">configurada</Badge> : <Badge tone="muted">vacía (modo mock)</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{k.description}</p>
                  <Input id={k.key} name="value" type="password" defaultValue={value} placeholder={value ? mask(value) : "sk-..."} />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">Guardar</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
        {modelFields.map((modelKey) => (
        <Card key={modelKey.key}>
          <CardContent className="p-5">
            <form action={saveSetting} className="space-y-2">
              <input type="hidden" name="key" value={modelKey.key} />
              <Label htmlFor={modelKey.key}>{modelKey.label}</Label>
              <Select id={modelKey.key} name="value" defaultValue={map.get(modelKey.key) || modelKey.options[0]}>
                {modelKey.options.map((o) => (
                  <option key={o || "empty"} value={o}>{o || "(usar el default de OpenAI)"}</option>
                ))}
              </Select>
              <div className="flex justify-end">
                <Button type="submit" size="sm">Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        ))}
      </div>
    </div>
  );
}
