import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, QUOTE_CORPORATE_ASSETS } from "@/lib/quote-defaults";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { getSetting } from "@/lib/settings";
import { saveQuoteBlockTemplate, saveQuoteModuleSetting } from "@/server/actions/quotes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";

export const metadata = { title: "Admin · Configuración de cotizaciones" };

async function settingRow(key: string, fallback: string) {
  return getSetting(key, fallback);
}

function SettingField({
  settingKey,
  label,
  hint,
  defaultValue,
  multiline,
}: {
  settingKey: string;
  label: string;
  hint?: string;
  defaultValue: string;
  multiline?: boolean;
}) {
  return (
    <form action={saveQuoteModuleSetting} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="key" value={settingKey} />
      <div>
        <Label htmlFor={settingKey}>{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {multiline ? (
          <Textarea id={settingKey} name="value" rows={5} defaultValue={defaultValue} className="mt-1" />
        ) : (
          <Input id={settingKey} name="value" defaultValue={defaultValue} className="mt-1" />
        )}
      </div>
      <Button type="submit" size="sm">
        Guardar
      </Button>
    </form>
  );
}

export default async function QuoteConfigPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return null;
  }
  await ensureQuoteProfiles();
  const [
    prefix,
    includeDate,
    dateToken,
    separator,
    padding,
    nextSequence,
    defaultLayout,
    defaultProfile,
    defaultIva,
    showDelivery,
    deliveryOptions,
    validityDays,
    paymentReference,
    paymentTerms,
    productWarranty,
    tagline,
    address,
    phone,
    email,
    web,
    logoUrl,
    headerUrl,
    brandsUrl,
    isoUrl,
    blocks,
  ] = await Promise.all([
    settingRow(QUOTE_SETTING_KEYS.prefix, "COT"),
    settingRow(QUOTE_SETTING_KEYS.includeDate, "false"),
    settingRow(QUOTE_SETTING_KEYS.dateToken, "YYYY"),
    settingRow(QUOTE_SETTING_KEYS.separator, ""),
    settingRow(QUOTE_SETTING_KEYS.padding, "5"),
    settingRow(QUOTE_SETTING_KEYS.nextSequence, "14544"),
    settingRow(QUOTE_SETTING_KEYS.defaultLayout, "STANDARD"),
    settingRow(QUOTE_SETTING_KEYS.defaultProfile, "tecnico"),
    settingRow(QUOTE_SETTING_KEYS.defaultIva, "21"),
    settingRow(QUOTE_SETTING_KEYS.showDeliveryDefault, "true"),
    settingRow(QUOTE_SETTING_KEYS.deliveryOptions, ""),
    settingRow(QUOTE_SETTING_KEYS.validityDays, "5"),
    settingRow(
      QUOTE_SETTING_KEYS.paymentReference,
      "El pago podrá efectuarse en pesos argentinos, utilizando como referencia la cotización del tipo de cambio billete, tipo vendedor del Banco de la Nación Argentina (BNA) vigente al día de la cancelación efectiva de la factura."
    ),
    settingRow(QUOTE_SETTING_KEYS.paymentTerms, "A CONVENIR."),
    settingRow(
      QUOTE_SETTING_KEYS.productWarranty,
      "Salvo indicación en contrario, todos los productos gozan de una garantía de 12 meses a partir de la fecha de facturación, contra vicios de fabricación."
    ),
    settingRow(QUOTE_SETTING_KEYS.companyTagline, "integramos tecnología"),
    settingRow(QUOTE_SETTING_KEYS.companyAddress, "Av. Donato Alvarez 1526 (C1416BTR) C.A.B.A."),
    settingRow(QUOTE_SETTING_KEYS.companyPhone, "(+ 54 11) 4586 0400"),
    settingRow(QUOTE_SETTING_KEYS.companyEmail, "info@soundtec.com.ar"),
    settingRow(QUOTE_SETTING_KEYS.companyWeb, "www.soundtec.com.ar"),
    settingRow(QUOTE_SETTING_KEYS.companyLogoUrl, QUOTE_CORPORATE_ASSETS.logo),
    settingRow(QUOTE_SETTING_KEYS.companyHeaderUrl, QUOTE_CORPORATE_ASSETS.header),
    settingRow(QUOTE_SETTING_KEYS.companyBrandsUrl, QUOTE_CORPORATE_ASSETS.brands),
    settingRow(QUOTE_SETTING_KEYS.companyIsoUrl, QUOTE_CORPORATE_ASSETS.iso),
    prisma.quoteBlock.findMany({ where: { version: 1 }, orderBy: { key: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración de cotizaciones"
        description="Numeración, identidad, textos fijos e imágenes de plantilla. No está en Configuración general."
        actions={
          <ButtonLink href="/admin/quotes" variant="outline" size="sm">
            Volver a cotizaciones
          </ButtonLink>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="heading-3">Identidad fija (COT Word)</h2>
          <p className="text-sm text-muted-foreground">
            Logo, franja de contacto, collage de marcas y sellos IRAM/IQNet salen de las plantillas COT. Las fotos de producto no van fijas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <figure className="rounded-md border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl || QUOTE_CORPORATE_ASSETS.logo} alt="Logo" className="h-16 object-contain" />
              <figcaption className="mt-1 text-xs text-muted-foreground">Encabezado</figcaption>
            </figure>
            <figure className="rounded-md border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headerUrl || QUOTE_CORPORATE_ASSETS.header} alt="Pie de contacto" className="w-full object-contain" />
              <figcaption className="mt-1 text-xs text-muted-foreground">Pie de página</figcaption>
            </figure>
            <figure className="rounded-md border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brandsUrl || QUOTE_CORPORATE_ASSETS.brands} alt="Marcas" className="w-full object-contain" />
              <figcaption className="mt-1 text-xs text-muted-foreground">Collage de marcas</figcaption>
            </figure>
            <figure className="rounded-md border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={isoUrl || QUOTE_CORPORATE_ASSETS.iso} alt="ISO" className="h-20 object-contain" />
              <figcaption className="mt-1 text-xs text-muted-foreground">IRAM / IQNet</figcaption>
            </figure>
          </div>
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyTagline} label="Tagline" defaultValue={tagline} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyAddress} label="Dirección" defaultValue={address} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyPhone} label="Teléfono" defaultValue={phone} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyEmail} label="Mail" defaultValue={email} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyWeb} label="Web" defaultValue={web} />
          <SettingField
            settingKey={QUOTE_SETTING_KEYS.companyLogoUrl}
            label="Ruta del logo"
            hint="Por defecto /quotes/soundtec-logo.png"
            defaultValue={logoUrl}
          />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyHeaderUrl} label="Ruta del pie / encabezado de contacto" defaultValue={headerUrl} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyBrandsUrl} label="Ruta del collage de marcas" defaultValue={brandsUrl} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.companyIsoUrl} label="Ruta de sellos ISO" defaultValue={isoUrl} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="heading-3">Numeración</h2>
          <SettingField settingKey={QUOTE_SETTING_KEYS.prefix} label="Prefijo" defaultValue={prefix} />
          <SettingField
            settingKey={QUOTE_SETTING_KEYS.includeDate}
            label="Incluir fecha (true/false)"
            defaultValue={includeDate}
          />
          <SettingField settingKey={QUOTE_SETTING_KEYS.dateToken} label="Token de fecha" hint="YYYY / YY / YYYYMM / YYYYMMDD" defaultValue={dateToken} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.separator} label="Separador" defaultValue={separator} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.padding} label="Dígitos del correlativo" defaultValue={padding} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.nextSequence} label="Siguiente número" defaultValue={nextSequence} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="heading-3">Defaults de documento</h2>
          <form action={saveQuoteModuleSetting} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="key" value={QUOTE_SETTING_KEYS.defaultLayout} />
            <div>
              <Label htmlFor="layout">Layout default</Label>
              <Select id="layout" name="value" defaultValue={defaultLayout}>
                <option value="COMPACT">Compacto</option>
                <option value="STANDARD">Estándar</option>
                <option value="EDITORIAL">Editorial</option>
              </Select>
            </div>
            <Button type="submit" size="sm">
              Guardar
            </Button>
          </form>
          <form action={saveQuoteModuleSetting} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="key" value={QUOTE_SETTING_KEYS.defaultProfile} />
            <div>
              <Label htmlFor="profile">Perfil default</Label>
              <Select id="profile" name="value" defaultValue={defaultProfile}>
                <option value="resumido">Resumido</option>
                <option value="tecnico">Técnico estándar</option>
                <option value="premium">Técnico premium</option>
              </Select>
            </div>
            <Button type="submit" size="sm">
              Guardar
            </Button>
          </form>
          <SettingField settingKey={QUOTE_SETTING_KEYS.defaultIva} label="IVA default (%)" defaultValue={defaultIva} />
          <SettingField
            settingKey={QUOTE_SETTING_KEYS.showDeliveryDefault}
            label="Mostrar columna entrega (true/false)"
            defaultValue={showDelivery}
          />
          <SettingField
            settingKey={QUOTE_SETTING_KEYS.deliveryOptions}
            label="Opciones de entrega"
            hint="Una por línea"
            defaultValue={deliveryOptions}
            multiline
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="heading-3">Condiciones comerciales default</h2>
          <SettingField settingKey={QUOTE_SETTING_KEYS.validityDays} label="Vigencia (días)" defaultValue={validityDays} />
          <SettingField settingKey={QUOTE_SETTING_KEYS.paymentTerms} label="Forma de pago" defaultValue={paymentTerms} multiline />
          <SettingField settingKey={QUOTE_SETTING_KEYS.paymentReference} label="Referencia de pago" defaultValue={paymentReference} multiline />
          <SettingField settingKey={QUOTE_SETTING_KEYS.productWarranty} label="Garantía de producto" defaultValue={productWarranty} multiline />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="heading-3">Textos de plantilla</h2>
        <p className="text-sm text-muted-foreground">
          Estos cuerpos se copian a cada COT nueva. Los de tipo fixed no los reescribe la IA.
        </p>
        {blocks.map((block) => (
          <Card key={block.id}>
            <CardContent className="p-5">
              <form action={saveQuoteBlockTemplate} className="space-y-3">
                <input type="hidden" name="blockId" value={block.id} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {block.key} · {block.category}
                  </p>
                </div>
                <div>
                  <Label htmlFor={`title-${block.id}`}>Título</Label>
                  <Input id={`title-${block.id}`} name="title" defaultValue={block.title} />
                </div>
                <div>
                  <Label htmlFor={`body-${block.id}`}>Texto</Label>
                  <Textarea id={`body-${block.id}`} name="body" rows={8} defaultValue={block.body} className="min-h-[140px]" />
                </div>
                <Button type="submit" size="sm">
                  Guardar módulo
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
