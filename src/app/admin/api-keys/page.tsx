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
  { key: "openai.api_key", label: "OpenAI API Key", description: "Imprescindible: redacción de COT, visión de planos y DALL·E para esquemas conceptuales." },
  { key: "serper.api_key", label: "Serper API Key", description: "Fotos reales de producto/aplicación. El vendedor elige; no se pegan solas en el PDF." },
  { key: "images.api_key", label: "API Key de imágenes (opcional)", description: "Si está vacía se usa la de OpenAI. DALL·E 3 para esquemas, siempre etiquetados como conceptuales." },
  { key: "higgsfield.api_key", label: "Higgsfield API Key (opcional)", description: "No es el motor del módulo. Sólo si más adelante cambiás el proveedor a Higgsfield." },
  { key: "anthropic.api_key", label: "Anthropic API Key", description: "Opcional. Reserva para otro redactor." },
  { key: "gemini.api_key", label: "Google Gemini API Key", description: "Opcional. También lee GEMINI_API_KEY del entorno." },
];

const modelFields = [
  { key: "openai.model", label: "Modelo OpenAI por defecto", options: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4-turbo"] },
  { key: "quotes.ai.writer_model", label: "Modelo redactor de cotizaciones", options: ["", "gpt-4o-mini", "gpt-4o", "gpt-4.1"] },
  { key: "quotes.ai.vision_model", label: "Modelo visión (planos)", options: ["", "gpt-4o", "gpt-4.1"] },
  { key: "images.provider", label: "Proveedor de esquemas", options: ["openai", "none", "higgsfield"] },
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
        description="OpenAI + Serper son las que hacen andar el copiloto de cotizaciones. Higgsfield queda como reserva, no como motor principal."
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
