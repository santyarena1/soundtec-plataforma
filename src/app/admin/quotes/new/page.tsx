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

export const metadata = { title: "Admin · Nueva cotización" };

export default async function NewQuotePage() {
  await requireQuotePermission("quotes.create");
  await ensureQuoteProfiles();
  const [clients, profiles, cfg] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, tradeName: true },
    }),
    prisma.quoteContentProfile.findMany({ orderBy: { name: "asc" } }),
    getQuoteNumberingConfig(),
  ]);
  const preview = formatQuoteNumber({ ...cfg, sequence: cfg.nextSequence });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva cotización"
        description={`Se va a reservar el número ${preview}. Podés arrancar con un brief y planos, o dejarlo vacío y armar el BOM a mano.`}
      />

      <Card>
        <CardContent className="p-6">
          <form action={createQuoteFromBrief} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="clientId">Cliente</Label>
                <Select id="clientId" name="clientId" defaultValue="">
                  <option value="">Asignar después (bloquea emitir)</option>
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
                <Input id="contactName" name="contactName" />
              </div>
              <div>
                <Label htmlFor="reference">Referencia / nombre del proyecto</Label>
                <Input id="reference" name="reference" placeholder="Sistema de Audio Comercial" />
              </div>
              <div>
                <Label htmlFor="projectType">Tipo de proyecto</Label>
                <Select id="projectType" name="projectType" defaultValue="">
                  <option value="">Que lo infiera la IA</option>
                  <option value="audio_comercial">Audio comercial</option>
                  <option value="aula_hibrida">Aula híbrida</option>
                  <option value="sala_reunion">Sala de reunión</option>
                  <option value="auditorio">Auditorio</option>
                  <option value="retail">Retail</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="uc_teams">UC / Teams</option>
                  <option value="otro">Otro</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="layoutKey">Layout visual</Label>
                <Select id="layoutKey" name="layoutKey" defaultValue="STANDARD">
                  <option value="COMPACT">Compacto</option>
                  <option value="STANDARD">Estándar</option>
                  <option value="EDITORIAL">Editorial</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="profileKey">Perfil de contenido</Label>
                <Select id="profileKey" name="profileKey" defaultValue={profiles.find((p) => p.isDefault)?.key || "tecnico"}>
                  {profiles.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="brief">Brief del proyecto</Label>
              <FieldHint>Pegá el mail, el relevamiento o escribí como se lo explicarías a ingeniería.</FieldHint>
              <Textarea
                id="brief"
                name="brief"
                rows={10}
                className="min-h-[180px]"
                placeholder="Ej. Local gastronómico en Palermo, 3 zonas interiores + jardín, música de fondo, control simple por zona, nada visible en mesas…"
              />
            </div>

            <div>
              <Label htmlFor="plans">Planos y fotos de obra</Label>
              <FieldHint>PDF o imágenes. Varios. La IA los lee al generar. Si no hay Blob token, adjuntá después en la COT.</FieldHint>
              <Input id="plans" name="plans" type="file" accept="image/*,.pdf" multiple />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="alternativesEnabled" className="h-4 w-4" />
              Esta COT tiene alternativas (A/B)
            </label>

            <QuoteAdvancedFields />

            <p className="text-xs text-muted-foreground">
              Al crear entras a Brief y planos, con plantilla precargada y vista previa al lado. La planilla se edita como tabla.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="submit">Crear propuesta</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
