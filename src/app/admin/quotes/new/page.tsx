import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { ensureQuoteProfiles } from "@/lib/quote-defaults";
import { getQuoteNumberingConfig, formatQuoteNumber } from "@/lib/quote-settings";
import { createQuoteFromBrief } from "@/server/actions/quotes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select, FieldHint } from "@/components/ui/input";
import { QuoteAdvancedFields } from "./advanced-fields";
import { QuoteClassifierFields } from "@/components/quotes/quote-classifier-fields";
import { listQuoteClassifiers } from "@/lib/quote-classifiers";

export const metadata = { title: "Admin · Nueva cotización" };

const PROFILE_HELP: Record<string, string> = {
  resumido: "Solo lo esencial: apertura, propuesta, tabla de productos y condiciones.",
  tecnico: "Incluye criterios de diseño y textos técnicos estándar.",
  premium: "Todos los módulos de texto, incluidos productos clave y funcionalidad.",
};

export default async function NewQuotePage() {
  await requireQuotePermission("quotes.create");
  await ensureQuoteProfiles();
  const [clients, profiles, cfg, classifiers] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, tradeName: true },
    }),
    prisma.quoteContentProfile.findMany({ orderBy: { name: "asc" } }),
    getQuoteNumberingConfig(),
    listQuoteClassifiers(),
  ]);
  const preview = formatQuoteNumber({ ...cfg, sequence: cfg.nextSequence });
  const defaultProfile = profiles.find((p) => p.isDefault)?.key || "tecnico";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva cotización"
        description={`Se reserva el número ${preview}. Completá lo básico; el resto se ajusta en el editor.`}
      />

      <Card>
        <CardContent className="p-6">
          <form action={createQuoteFromBrief} className="space-y-6">
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">1. Cliente y proyecto</h2>
                <p className="text-xs text-muted-foreground">Datos que salen en el encabezado del PDF.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="clientId">Cliente</Label>
                  <Select id="clientId" name="clientId" defaultValue="">
                    <option value="">Asignar después (no podés emitir sin cliente)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                        {c.tradeName ? ` (${c.tradeName})` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="contactName">Contacto</Label>
                  <Input id="contactName" name="contactName" placeholder="Ej. María López — Compras" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="reference">Nombre del proyecto</Label>
                  <FieldHint>Ej. «Sistema de audio para salón de eventos — Hotel X»</FieldHint>
                  <Input id="reference" name="reference" placeholder="Sistema de audio comercial" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">2. Qué hay que cotizar</h2>
                <p className="text-xs text-muted-foreground">
                  La IA usa esto para sugerir productos y redactar «Nuestra propuesta». No hace falta ser técnico.
                </p>
              </div>
              <Textarea
                id="brief"
                name="brief"
                rows={8}
                className="min-h-[160px]"
                placeholder="Ej. Local en Palermo, 3 zonas interiores + jardín. Música de fondo, control simple por zona, nada visible en mesas. Presupuesto orientativo USD 25.000."
              />
              <div>
                <Label htmlFor="plans">Planos o fotos (opcional)</Label>
                <FieldHint>PDF o imágenes. La IA los lee al generar la propuesta.</FieldHint>
                <Input id="plans" name="plans" type="file" accept="image/*,.pdf" multiple className="mt-1" />
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-border bg-secondary/20 p-4">
              <div>
                <h2 className="text-sm font-semibold">3. Tipo de documento</h2>
                <p className="text-xs text-muted-foreground">Define cuántos módulos de texto trae la cotización nueva.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="profileKey">Extensión del texto</Label>
                  <Select id="profileKey" name="profileKey" defaultValue={defaultProfile}>
                    {profiles.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {PROFILE_HELP[defaultProfile] || "Podés cambiar módulos después en el paso Módulos."}
                  </p>
                </div>
                <div>
                  <Label htmlFor="layoutKey">Diseño del PDF</Label>
                  <Select id="layoutKey" name="layoutKey" defaultValue="STANDARD">
                    <option value="COMPACT">Compacto — menos páginas</option>
                    <option value="STANDARD">Estándar — el más usado</option>
                    <option value="EDITORIAL">Editorial — más aire visual</option>
                  </Select>
                </div>
              </div>
            </section>

            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Clasificación interna (opcional)
              </summary>
              <div className="space-y-2 border-t border-border px-4 py-4">
                <p className="text-xs text-muted-foreground">
                  Ayuda a sugerir equipos de cotizaciones parecidas. Se edita en Configuración → Cotizaciones →
                  Clasificadores.
                </p>
                <QuoteClassifierFields classifiers={classifiers} />
              </div>
            </details>

            <QuoteAdvancedFields />

            <p className="text-xs text-muted-foreground">
              Al crear entrás al paso «Brief y generación». Ahí podés ejecutar la IA para armar productos sugeridos y el
              texto de «Nuestra propuesta».
            </p>

            <div className="flex justify-end">
              <Button type="submit">Crear cotización</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
