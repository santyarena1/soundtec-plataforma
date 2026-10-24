import Link from "next/link";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, QUOTE_CORPORATE_ASSETS } from "@/lib/quote-defaults";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { TAX_MODES } from "@/lib/quote-totals";
import { getSetting } from "@/lib/settings";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { SimpleTabs } from "@/components/ui/simple-tabs";
import { ButtonLink } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { BrandLogoTile, IdentityImageField, SettingsBatchForm } from "./settings-forms";
import { brandLogoSrc } from "@/lib/brand-logo";

export const metadata = { title: "Admin · Configuración de cotizaciones" };

const name = (key: string) => `setting:${key}`;

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      {hint ? <p className="mb-1 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

const PROFILES = [
  { value: "resumido", label: "Resumido — tabla, condiciones y firma" },
  { value: "tecnico", label: "Técnico — propuesta, marcas, instalación y garantías" },
  { value: "premium", label: "Premium — documento completo" },
];

function numberPreview(input: { prefix: string; includeDate: string; dateToken: string; separator: string; padding: string; next: string }) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date =
    input.dateToken === "YY"
      ? String(now.getFullYear()).slice(2)
      : input.dateToken === "YYYYMM"
        ? `${now.getFullYear()}${pad(now.getMonth() + 1)}`
        : input.dateToken === "YYYYMMDD"
          ? `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
          : String(now.getFullYear());
  const seq = String(Number(input.next) || 1).padStart(Number(input.padding) || 5, "0");
  return [input.prefix, input.includeDate === "true" ? date : null, seq].filter(Boolean).join(input.separator);
}

export default async function SettingsQuotesPage() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) return null;
  await ensureQuoteProfiles();

  const K = QUOTE_SETTING_KEYS;
  const keys = [
    [K.prefix, "COT"],
    [K.includeDate, "false"],
    [K.dateToken, "YYYY"],
    [K.separator, ""],
    [K.padding, "5"],
    [K.nextSequence, "14544"],
    [K.defaultProfile, "tecnico"],
    [K.defaultTaxMode, "NOTE"],
    [K.defaultIva, "21"],
    [K.defaultUnit, "u"],
    [K.defaultDelivery, ""],
    [K.showDeliveryDefault, "true"],
    [K.deliveryOptions, ""],
    [K.validityDays, "5"],
    [
      K.paymentReference,
      "El pago podrá efectuarse en pesos argentinos, utilizando como referencia la cotización del tipo de cambio billete, tipo vendedor del Banco de la Nación Argentina (BNA) vigente al día de la cancelación efectiva de la factura.",
    ],
    [K.paymentTerms, "A CONVENIR."],
    [K.deliveryText, "El plazo de entrega será confirmado una vez recibida la orden de compra formal."],
    [
      K.productWarranty,
      "Salvo indicación en contrario, todos los productos gozan de una garantía de 12 meses a partir de la fecha de facturación, contra vicios de fabricación.",
    ],
    [K.companyLogoUrl, ""],
    [K.companyHeaderUrl, ""],
    [K.companyBrandsUrl, ""],
    [K.companyIsoUrl, ""],
    [K.brandsDisplayMode, "collage"],
  ] as const;
  const values = Object.fromEntries(await Promise.all(keys.map(async ([key, fallback]) => [key, await getSetting(key, fallback)] as const))) as Record<string, string>;
  const v = (key: string) => values[key] ?? "";

  const [brands, blocksCount] = await Promise.all([
    prisma.brand.findMany({
      where: { products: { some: { isActive: true } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true, _count: { select: { products: true } } },
    }),
    prisma.quoteBlock.count({ where: { isActive: true } }),
  ]);
  const withoutLogo = brands.filter((b) => !b.logoUrl);

  const documento = (
    <SettingsBatchForm title="Cómo nace cada cotización" description="Valores con que arranca cada COT nueva (rápida, completa, desde un pedido o desde Room Builder). Se pueden cambiar en cada cotización.">
      <Field label="Tipo de documento" hint="Qué módulos lleva el PDF.">
        <Select name={name(K.defaultProfile)} defaultValue={v(K.defaultProfile)}>
          {PROFILES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Impuestos" hint="Cómo aparece el IVA en el documento.">
        <Select name={name(K.defaultTaxMode)} defaultValue={v(K.defaultTaxMode)}>
          {TAX_MODES.map((mode) => (
            <option key={mode.key} value={mode.key}>
              {mode.label} — {mode.hint}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="IVA por defecto (%)" hint="Para productos sin IVA en la ficha.">
        <Input name={name(K.defaultIva)} type="number" min={0} max={100} step="0.5" defaultValue={v(K.defaultIva)} />
      </Field>
      <Field label="Unidad por defecto" hint="u, global, ml, hs…">
        <Input name={name(K.defaultUnit)} defaultValue={v(K.defaultUnit)} />
      </Field>
      <Field label="Columna de entrega" hint="Si la planilla muestra la entrega de cada fila.">
        <Select name={name(K.showDeliveryDefault)} defaultValue={v(K.showDeliveryDefault)}>
          <option value="true">Mostrar</option>
          <option value="false">No mostrar</option>
        </Select>
      </Field>
      <Field label="Entrega por defecto de cada fila" hint="Vacío = se carga a mano (sin entrega no se emite si la columna está visible).">
        <Input name={name(K.defaultDelivery)} defaultValue={v(K.defaultDelivery)} />
      </Field>
      <Field label="Opciones de entrega" hint="Una por línea." wide>
        <Textarea name={name(K.deliveryOptions)} rows={3} defaultValue={v(K.deliveryOptions)} />
      </Field>
    </SettingsBatchForm>
  );

  const condiciones = (
    <SettingsBatchForm title="Condiciones comerciales" description="Se copian a cada COT nueva y el texto del documento las toma (forma de pago, vigencia, entrega). El vendedor puede ajustarlas en cada cotización.">
      <Field label="Vigencia de la oferta (días)">
        <Input name={name(K.validityDays)} type="number" min={1} max={365} defaultValue={v(K.validityDays)} />
      </Field>
      <Field label="Forma de pago">
        <Input name={name(K.paymentTerms)} defaultValue={v(K.paymentTerms)} />
      </Field>
      <Field label="Plazo de entrega" wide>
        <Textarea name={name(K.deliveryText)} rows={2} defaultValue={v(K.deliveryText)} />
      </Field>
      <Field label="Referencia de pago" wide>
        <Textarea name={name(K.paymentReference)} rows={3} defaultValue={v(K.paymentReference)} />
      </Field>
      <Field label="Garantía de producto" wide>
        <Textarea name={name(K.productWarranty)} rows={3} defaultValue={v(K.productWarranty)} />
      </Field>
    </SettingsBatchForm>
  );

  const identidad = (
    <>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Imágenes del documento</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Subí la imagen nueva y queda para todas las cotizaciones (también las ya creadas, al regenerar el PDF).</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <IdentityImageField settingKey={K.companyLogoUrl} label="Logo del encabezado" hint="Arriba de cada página." currentUrl={v(K.companyLogoUrl)} fallbackUrl={QUOTE_CORPORATE_ASSETS.logo} isCustom={!!v(K.companyLogoUrl)} />
          <IdentityImageField settingKey={K.companyHeaderUrl} label="Pie de contacto" hint="Franja con dirección, teléfono y web." currentUrl={v(K.companyHeaderUrl)} fallbackUrl={QUOTE_CORPORATE_ASSETS.header} isCustom={!!v(K.companyHeaderUrl)} />
          <IdentityImageField settingKey={K.companyBrandsUrl} label="Collage de marcas" hint="Se usa con el modo «collage»." currentUrl={v(K.companyBrandsUrl)} fallbackUrl={QUOTE_CORPORATE_ASSETS.brands} isCustom={!!v(K.companyBrandsUrl)} />
          <IdentityImageField settingKey={K.companyIsoUrl} label="Sellos IRAM / IQNet" hint="Módulo de certificaciones." currentUrl={v(K.companyIsoUrl)} fallbackUrl={QUOTE_CORPORATE_ASSETS.iso} isCustom={!!v(K.companyIsoUrl)} />
        </div>
      </div>

      <SettingsBatchForm title="Marcas en el PDF" description="Collage: una imagen con todas las marcas. Logos individuales: cada COT muestra los logos de las marcas que cotiza (se pueden ocultar o agregar en el paso Módulos).">
        <Field label="Modo" wide>
          <Select name={name(K.brandsDisplayMode)} defaultValue={v(K.brandsDisplayMode)}>
            <option value="collage">Collage institucional</option>
            <option value="individual">Logos individuales de las marcas cotizadas</option>
          </Select>
        </Field>
      </SettingsBatchForm>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Logos de las marcas</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Es el mismo logo del catálogo (una sola fuente). Tocá una marca para subir o cambiar su logo.
              {withoutLogo.length ? ` ${withoutLogo.length} marcas con productos no tienen logo.` : ""}
            </p>
          </div>
          <ButtonLink href="/admin/brands" size="sm" variant="outline">
            Ir a Marcas
          </ButtonLink>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {brands.map((brand) => (
            <li key={brand.id}>
              <BrandLogoTile brand={{ id: brand.id, name: brand.name, logoSrc: brandLogoSrc(brand) }} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  const numeracion = (
    <SettingsBatchForm
      title="Numeración"
      description={`Así sale el próximo número: ${numberPreview({ prefix: v(K.prefix), includeDate: v(K.includeDate), dateToken: v(K.dateToken), separator: v(K.separator), padding: v(K.padding), next: v(K.nextSequence) })}`}
    >
      <Field label="Prefijo">
        <Input name={name(K.prefix)} defaultValue={v(K.prefix)} />
      </Field>
      <Field label="Separador" hint="Entre prefijo, fecha y número (puede ir vacío).">
        <Input name={name(K.separator)} defaultValue={v(K.separator)} />
      </Field>
      <Field label="Incluir la fecha">
        <Select name={name(K.includeDate)} defaultValue={v(K.includeDate)}>
          <option value="false">No</option>
          <option value="true">Sí</option>
        </Select>
      </Field>
      <Field label="Formato de fecha">
        <Select name={name(K.dateToken)} defaultValue={v(K.dateToken)}>
          <option value="YYYY">Año (2026)</option>
          <option value="YY">Año corto (26)</option>
          <option value="YYYYMM">Año y mes (202610)</option>
          <option value="YYYYMMDD">Fecha completa (20261024)</option>
        </Select>
      </Field>
      <Field label="Dígitos del número">
        <Input name={name(K.padding)} type="number" min={1} max={10} defaultValue={v(K.padding)} />
      </Field>
      <Field label="Siguiente número" hint="Cuidado: bajarlo puede repetir números ya usados.">
        <Input name={name(K.nextSequence)} type="number" min={1} defaultValue={v(K.nextSequence)} />
      </Field>
    </SettingsBatchForm>
  );

  const avanzado = (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { href: "/admin/settings/quotes/plantilla", title: "Textos de la plantilla", body: `Editá los ${blocksCount} módulos sobre un presupuesto de muestra. Se copian a las COT nuevas.` },
        { href: "/admin/settings/quotes/variantes", title: "Variantes de texto", body: "Versiones alternativas de disciplinas, presentación e instalación." },
        { href: "/admin/settings/quotes/modulos", title: "Módulos extra", body: "Bloques que se insertan a pedido en una cotización." },
        { href: "/admin/settings/quotes/clasificadores", title: "Clasificadores internos", body: "Tipo de sala y escala, para sugerir equipos de casos parecidos." },
        { href: "/admin/settings/quotes/marcas", title: "Logos sin marca en el catálogo", body: "Logos que se quieren mostrar y no son de una marca cargada (ej. certificaciones, partners)." },
      ].map((item) => (
        <Link key={item.href} href={item.href} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/30">
          <p className="text-sm font-semibold">{item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        href="/admin/settings/quotes"
        actions={
          <ButtonLink href="/admin/quotes" variant="outline" size="sm">
            Ir a cotizaciones
          </ButtonLink>
        }
      />
      <SimpleTabs
        tabs={[
          { key: "documento", label: "Documento", content: documento },
          { key: "condiciones", label: "Condiciones", content: condiciones },
          { key: "identidad", label: "Logos e imágenes", content: identidad },
          { key: "numeracion", label: "Numeración", content: numeracion },
          { key: "avanzado", label: "Plantilla y avanzado", content: avanzado },
        ]}
      />
    </div>
  );
}
