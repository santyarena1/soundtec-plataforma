import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, QUOTE_CORPORATE_ASSETS } from "@/lib/quote-defaults";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { getSetting } from "@/lib/settings";
import { saveQuoteModuleSetting } from "@/server/actions/quotes";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { withCurrentValueOption, type SettingOption } from "@/components/admin/setting-field";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";

export const metadata = { title: "Admin · Configuración de cotizaciones" };

function QuoteSettingField({
  settingKey,
  label,
  hint,
  defaultValue,
  multiline,
  options,
}: {
  settingKey: string;
  label: string;
  hint?: string;
  defaultValue: string;
  multiline?: boolean;
  options?: SettingOption[];
}) {
  return (
    <form
      action={saveQuoteModuleSetting}
      className="grid gap-2 py-4 first:pt-3 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3"
    >
      <input type="hidden" name="key" value={settingKey} />
      <div className="min-w-0">
        <Label htmlFor={settingKey}>{label}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        {options ? (
          <Select id={settingKey} name="value" defaultValue={defaultValue} className="mt-1.5">
            {withCurrentValueOption(options, defaultValue).map((o) => (
              <option key={o.value || "__empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : multiline ? (
          <Textarea id={settingKey} name="value" rows={4} defaultValue={defaultValue} className="mt-1.5" />
        ) : (
          <Input id={settingKey} name="value" defaultValue={defaultValue} className="mt-1.5" />
        )}
      </div>
      <Button type="submit" variant="outline" size="sm">
        Guardar
      </Button>
    </form>
  );
}

function QuoteSettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="muted-text mt-0.5">{description}</p> : null}
        </div>
        <div className="mt-2 divide-y divide-border/70">{children}</div>
      </CardContent>
    </Card>
  );
}

const BOOLEAN_OPTIONS = [
  { value: "true", label: "Sí" },
  { value: "false", label: "No" },
];

export default async function SettingsQuotesPage() {
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
    getSetting(QUOTE_SETTING_KEYS.prefix, "COT"),
    getSetting(QUOTE_SETTING_KEYS.includeDate, "false"),
    getSetting(QUOTE_SETTING_KEYS.dateToken, "YYYY"),
    getSetting(QUOTE_SETTING_KEYS.separator, ""),
    getSetting(QUOTE_SETTING_KEYS.padding, "5"),
    getSetting(QUOTE_SETTING_KEYS.nextSequence, "14544"),
    getSetting(QUOTE_SETTING_KEYS.defaultLayout, "STANDARD"),
    getSetting(QUOTE_SETTING_KEYS.defaultProfile, "tecnico"),
    getSetting(QUOTE_SETTING_KEYS.defaultIva, "21"),
    getSetting(QUOTE_SETTING_KEYS.showDeliveryDefault, "true"),
    getSetting(QUOTE_SETTING_KEYS.deliveryOptions, ""),
    getSetting(QUOTE_SETTING_KEYS.validityDays, "5"),
    getSetting(
      QUOTE_SETTING_KEYS.paymentReference,
      "El pago podrá efectuarse en pesos argentinos, utilizando como referencia la cotización del tipo de cambio billete, tipo vendedor del Banco de la Nación Argentina (BNA) vigente al día de la cancelación efectiva de la factura."
    ),
    getSetting(QUOTE_SETTING_KEYS.paymentTerms, "A CONVENIR."),
    getSetting(
      QUOTE_SETTING_KEYS.productWarranty,
      "Salvo indicación en contrario, todos los productos gozan de una garantía de 12 meses a partir de la fecha de facturación, contra vicios de fabricación."
    ),
    getSetting(QUOTE_SETTING_KEYS.companyTagline, "integramos tecnología"),
    getSetting(QUOTE_SETTING_KEYS.companyAddress, "Av. Donato Alvarez 1526 (C1416BTR) C.A.B.A."),
    getSetting(QUOTE_SETTING_KEYS.companyPhone, "(+ 54 11) 4586 0400"),
    getSetting(QUOTE_SETTING_KEYS.companyEmail, "info@soundtec.com.ar"),
    getSetting(QUOTE_SETTING_KEYS.companyWeb, "www.soundtec.com.ar"),
    getSetting(QUOTE_SETTING_KEYS.companyLogoUrl, QUOTE_CORPORATE_ASSETS.logo),
    getSetting(QUOTE_SETTING_KEYS.companyHeaderUrl, QUOTE_CORPORATE_ASSETS.header),
    getSetting(QUOTE_SETTING_KEYS.companyBrandsUrl, QUOTE_CORPORATE_ASSETS.brands),
    getSetting(QUOTE_SETTING_KEYS.companyIsoUrl, QUOTE_CORPORATE_ASSETS.iso),
    prisma.quoteBlock.findMany({ where: { isActive: true }, orderBy: { key: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        href="/admin/settings/quotes"
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/settings/quotes/plantilla" size="sm">
              Editar plantilla visual
            </ButtonLink>
            <ButtonLink href="/admin/quotes" variant="outline" size="sm">
              Ir a cotizaciones
            </ButtonLink>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Textos e imágenes de la plantilla</h3>
            <p className="muted-text mt-0.5">
              Se editan sobre un presupuesto de muestra: clickeá el texto y escribí. Lo que cambies ahí se copia a
              las cotizaciones nuevas.
            </p>
          </div>
          <ButtonLink href="/admin/settings/quotes/plantilla" size="sm">
            Abrir editor
          </ButtonLink>
        </CardContent>
      </Card>

      <QuoteSettingsCard
        title="Numeración"
        description="Cómo se arma el número de cada cotización nueva."
      >
        <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.prefix} label="Prefijo" defaultValue={prefix} />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.includeDate}
          label="Incluir la fecha en el número"
          defaultValue={includeDate}
          options={BOOLEAN_OPTIONS}
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.dateToken}
          label="Formato de fecha"
          defaultValue={dateToken}
          options={[
            { value: "YYYY", label: "YYYY — año completo" },
            { value: "YY", label: "YY — año en dos dígitos" },
            { value: "YYYYMM", label: "YYYYMM — año y mes" },
            { value: "YYYYMMDD", label: "YYYYMMDD — fecha completa" },
          ]}
        />
        <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.separator} label="Separador" defaultValue={separator} />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.padding}
          label="Dígitos del correlativo"
          defaultValue={padding}
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.nextSequence}
          label="Siguiente número"
          hint="Cuidado: cambiarlo puede generar números duplicados."
          defaultValue={nextSequence}
        />
      </QuoteSettingsCard>

      <QuoteSettingsCard
        title="Valores por defecto del documento"
        description="Con qué opciones arranca cada cotización nueva."
      >
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.defaultLayout}
          label="Layout"
          defaultValue={defaultLayout}
          options={[
            { value: "COMPACT", label: "Compacto" },
            { value: "STANDARD", label: "Estándar" },
            { value: "EDITORIAL", label: "Editorial" },
          ]}
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.defaultProfile}
          label="Perfil de redacción"
          defaultValue={defaultProfile}
          options={[
            { value: "resumido", label: "Resumido" },
            { value: "tecnico", label: "Técnico estándar" },
            { value: "premium", label: "Técnico premium" },
          ]}
        />
        <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.defaultIva} label="IVA (%)" defaultValue={defaultIva} />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.showDeliveryDefault}
          label="Mostrar columna de entrega"
          defaultValue={showDelivery}
          options={BOOLEAN_OPTIONS}
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.deliveryOptions}
          label="Opciones de entrega"
          hint="Una por línea."
          defaultValue={deliveryOptions}
          multiline
        />
      </QuoteSettingsCard>

      <QuoteSettingsCard
        title="Condiciones comerciales"
        description="Textos que se copian a cada cotización y el vendedor puede ajustar."
      >
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.validityDays}
          label="Vigencia (días)"
          defaultValue={validityDays}
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.paymentTerms}
          label="Forma de pago"
          defaultValue={paymentTerms}
          multiline
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.paymentReference}
          label="Referencia de pago"
          defaultValue={paymentReference}
          multiline
        />
        <QuoteSettingField
          settingKey={QUOTE_SETTING_KEYS.productWarranty}
          label="Garantía de producto"
          defaultValue={productWarranty}
          multiline
        />
      </QuoteSettingsCard>

      <Card>
        <CardContent className="p-5">
          <div>
            <h3 className="text-sm font-semibold">Identidad del documento</h3>
            <p className="muted-text mt-0.5">
              Logo, franja de contacto, collage de marcas y sellos IRAM/IQNet de la plantilla Word. Las fotos de
              producto no van fijas.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <figure className="rounded-md border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl || QUOTE_CORPORATE_ASSETS.logo} alt="Logo" className="h-16 object-contain" />
              <figcaption className="mt-1 text-xs text-muted-foreground">Encabezado</figcaption>
            </figure>
            <figure className="rounded-md border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerUrl || QUOTE_CORPORATE_ASSETS.header}
                alt="Pie de contacto"
                className="w-full object-contain"
              />
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

          <div className="mt-4 divide-y divide-border/70 border-t border-border/70">
            <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.companyTagline} label="Tagline" defaultValue={tagline} />
            <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.companyAddress} label="Dirección" defaultValue={address} />
            <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.companyPhone} label="Teléfono" defaultValue={phone} />
            <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.companyEmail} label="Mail" defaultValue={email} />
            <QuoteSettingField settingKey={QUOTE_SETTING_KEYS.companyWeb} label="Web" defaultValue={web} />
            <QuoteSettingField
              settingKey={QUOTE_SETTING_KEYS.companyLogoUrl}
              label="Ruta del logo"
              hint="Por defecto /quotes/soundtec-logo.png"
              defaultValue={logoUrl}
            />
            <QuoteSettingField
              settingKey={QUOTE_SETTING_KEYS.companyHeaderUrl}
              label="Ruta del pie de contacto"
              defaultValue={headerUrl}
            />
            <QuoteSettingField
              settingKey={QUOTE_SETTING_KEYS.companyBrandsUrl}
              label="Ruta del collage de marcas"
              defaultValue={brandsUrl}
            />
            <QuoteSettingField
              settingKey={QUOTE_SETTING_KEYS.companyIsoUrl}
              label="Ruta de los sellos ISO"
              defaultValue={isoUrl}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div>
            <h3 className="text-sm font-semibold">Módulos de la plantilla</h3>
            <p className="muted-text mt-0.5">
              {blocks.length} bloques activos. El texto se edita en el presupuesto de muestra, no acá.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-border/70 text-sm">
            {blocks.map((block) => (
              <li key={block.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {block.title}
                  <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">{block.category}</span>
                </span>
                <ButtonLink href="/admin/settings/quotes/plantilla" variant="ghost" size="sm">
                  Editar
                </ButtonLink>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
