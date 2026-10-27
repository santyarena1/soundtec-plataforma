import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { getQuoteNumberingConfig, formatQuoteNumber, QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { listDocumentTypes } from "@/lib/quote-document-types";
import { listQuoteAudiences } from "@/lib/quote-audiences-db";
import { AudienceSelect } from "@/components/quotes/audience-select";
import { TAX_MODES } from "@/lib/quote-totals";
import { getSetting } from "@/lib/settings";
import { createQuoteFromBrief } from "@/server/actions/quotes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select, FieldHint } from "@/components/ui/input";
import { QuoteAdvancedFields } from "./advanced-fields";
import { QuoteClassifierFields } from "@/components/quotes/quote-classifier-fields";
import { listQuoteClassifiers } from "@/lib/quote-classifiers";
import { ClientSelectWithCreate } from "@/components/admin/client-select-with-create";

export const metadata = { title: "Admin · Nueva cotización" };

export default async function NewQuotePage() {
  await requireQuotePermission("quotes.create");
  const [clients, documentTypes, cfg, classifiers, owners, priceLists, defaultProfileSetting, defaultTax, validity, audiences] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, tradeName: true },
    }),
    listDocumentTypes(),
    getQuoteNumberingConfig(),
    listQuoteClassifiers(),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSetting(QUOTE_SETTING_KEYS.defaultProfile, "tecnico"),
    getSetting(QUOTE_SETTING_KEYS.defaultTaxMode, "NOTE"),
    getSetting(QUOTE_SETTING_KEYS.validityDays, "5"),
    listQuoteAudiences(),
  ]);
  const preview = formatQuoteNumber({ ...cfg, sequence: cfg.nextSequence });
  const defaultProfile = documentTypes.some((t) => t.key === defaultProfileSetting) ? defaultProfileSetting : "tecnico";
  const defaultTaxMode = TAX_MODES.some((m) => m.key === defaultTax) ? defaultTax : "NOTE";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva cotización"
        description={`Se reserva el número ${preview}. Completá lo básico; el resto se ajusta en el editor.`}
      />

      <Card>
        <CardContent className="p-6">
          <form action={createQuoteFromBrief} className="space-y-6">
            <section className="space-y-3" data-tour="quote-new-client">
              <div>
                <h2 className="text-sm font-semibold">1. Cliente y proyecto</h2>
                <p className="text-xs text-muted-foreground">Datos que salen en el encabezado del PDF.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <ClientSelectWithCreate
                    clients={clients.map((c) => ({
                      id: c.id,
                      name: c.tradeName ? `${c.companyName} (${c.tradeName})` : c.companyName,
                    }))}
                    owners={owners}
                    priceLists={priceLists}
                    placeholder="Elegí un cliente dado de alta…"
                  />
                  <div className="mt-2">
                    <Label htmlFor="clientName">o escribí el cliente (sin darlo de alta)</Label>
                    <Input id="clientName" name="clientName" placeholder="Ej. Hotel Alvear" />
                    <FieldHint>Sale así en el encabezado. Si elegís uno de la lista, manda ese.</FieldHint>
                  </div>
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

            <section className="space-y-3" data-tour="quote-new-brief">
              <div>
                <h2 className="text-sm font-semibold">2. Qué hay que cotizar</h2>
                <p className="text-xs text-muted-foreground">
                  Si después le pedís a la IA que sugiera productos o redacte «Nuestra propuesta», usa esto. No hace falta ser técnico.
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

            <section className="space-y-3 rounded-md border border-border bg-secondary/20 p-4" data-tour="quote-new-type">
              <div>
                <h2 className="text-sm font-semibold">3. Cómo sale el documento</h2>
                <p className="text-xs text-muted-foreground">Todo se puede cambiar después en el editor.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="profileKey">Tipo de documento</Label>
                  <Select id="profileKey" name="profileKey" defaultValue={defaultProfile}>
                    {documentTypes.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <FieldHint>Qué secciones lleva el PDF. Los tipos propios se crean en Configuración → Cotizaciones.</FieldHint>
                </div>
                <div>
                  <Label htmlFor="audience">A quién va</Label>
                  <AudienceSelect id="audience" name="audience" audiences={audiences} defaultValue="" />
                  <FieldHint>Elige la versión de los textos del PDF para ese público. Sin elegir: la del tipo de documento, si tiene.</FieldHint>
                </div>
                <div>
                  <Label htmlFor="taxMode">Impuestos</Label>
                  <Select id="taxMode" name="taxMode" defaultValue={defaultTaxMode}>
                    {TAX_MODES.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="validityDays">Vigencia de la oferta (días)</Label>
                  <Input id="validityDays" name="validityDays" type="number" min="1" max="365" defaultValue={Number(validity) || 5} />
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
              Al crear entrás al editor. Si escribiste qué hay que cotizar, en «Qué necesita» decidís si la IA sugiere
              productos y redacta la propuesta: no arranca sola.
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
