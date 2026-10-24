import Link from "next/link";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureQuoteProfiles, QUOTE_CORPORATE_ASSETS, QUOTE_MODULES } from "@/lib/quote-defaults";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
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
  { value: "resumido", title: "Corto", hint: "Una o dos hojas: la tabla de productos, las condiciones y la firma." },
  { value: "tecnico", title: "Estándar", hint: "Lo más usado: propuesta, marcas, productos, instalación y condiciones." },
  { value: "premium", title: "Completo", hint: "Todo el documento, para proyectos grandes o licitaciones." },
];

const TAX_EXAMPLES = [
  { value: "NOTE", title: "Precio + IVA aparte", hint: "Los precios van sin IVA y el documento lo aclara.", example: "USD 1.000 + IVA" },
  { value: "ADDED", title: "Mostrar el IVA sumado", hint: "Muestra el IVA y el total final.", example: "USD 1.000 + IVA 21% = USD 1.210" },
  { value: "NONE", title: "Sin mencionar el IVA", hint: "No se habla de impuestos en el documento.", example: "USD 1.000" },
];

/** Opción grande para elegir (más fácil de leer que un desplegable). */
function ChoiceCard({ name, value, checked, title, hint, children }: { name: string; value: string; checked: boolean; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <label className="relative flex cursor-pointer flex-col rounded-lg border border-border p-3 transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-1 has-[:checked]:ring-primary/30">
      <span className="flex items-center gap-2">
        <input type="radio" name={name} value={value} defaultChecked={checked} className="h-4 w-4 accent-primary" />
        <span className="text-sm font-semibold">{title}</span>
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{hint}</span>
      {children}
    </label>
  );
}

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

  const profileModules = (key: string) => QUOTE_MODULES.filter((m) => (m.defaultOn as readonly string[]).includes(key)).map((m) => m.title);
  const documento = (
    <>
      <SettingsBatchForm title="¿Qué tan completo sale el PDF?" description="Es lo que trae cada cotización nueva. En cada cotización después podés agregar o sacar secciones.">
        <div className="grid gap-3 sm:col-span-2 lg:grid-cols-3">
          {PROFILES.map((profile) => (
            <ChoiceCard key={profile.value} name={name(K.defaultProfile)} value={profile.value} checked={v(K.defaultProfile) === profile.value} title={profile.title} hint={profile.hint}>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {profileModules(profile.value).map((title) => (
                  <li key={title}>· {title}</li>
                ))}
              </ul>
            </ChoiceCard>
          ))}
        </div>
      </SettingsBatchForm>

      <SettingsBatchForm title="¿Cómo se muestra el IVA?" description="Cómo aparecen los precios en el documento que recibe el cliente.">
        <div className="grid gap-3 sm:col-span-2 lg:grid-cols-3">
          {TAX_EXAMPLES.map((mode) => (
            <ChoiceCard key={mode.value} name={name(K.defaultTaxMode)} value={mode.value} checked={v(K.defaultTaxMode) === mode.value} title={mode.title} hint={mode.hint}>
              <p className="mt-2 rounded-md bg-secondary/60 px-2 py-1.5 font-mono text-xs">{mode.example}</p>
            </ChoiceCard>
          ))}
        </div>
        <Field label="IVA que se usa si el producto no tiene uno cargado (%)" hint="Normalmente 21. Cada producto puede tener el suyo en su ficha.">
          <Input name={name(K.defaultIva)} type="number" min={0} max={100} step="0.5" defaultValue={v(K.defaultIva)} />
        </Field>
      </SettingsBatchForm>

      <SettingsBatchForm title="Tabla de productos" description="Cómo nace cada renglón de la tabla de la cotización.">
        <Field label="¿Mostrar la columna «Entrega» (plazo de cada producto)?" wide>
          <div className="flex flex-wrap gap-4 pt-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name={name(K.showDeliveryDefault)} value="true" defaultChecked={v(K.showDeliveryDefault) !== "false"} /> Sí, con el plazo de cada producto
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={name(K.showDeliveryDefault)} value="false" defaultChecked={v(K.showDeliveryDefault) === "false"} /> No mostrarla
            </label>
          </div>
        </Field>
        <Field label="Plazo que se pone solo en cada producto" hint="Ej.: «Inmediata» o «15 días». Si lo dejás vacío, hay que cargarlo a mano (y con la columna visible no se puede emitir sin completarlo).">
          <Input name={name(K.defaultDelivery)} defaultValue={v(K.defaultDelivery)} placeholder="Ej. Inmediata" />
        </Field>
        <Field label="Unidad que se pone sola" hint="«u» = unidad. Otros ejemplos: «m» (metros), «hs» (horas), «global».">
          <Input name={name(K.defaultUnit)} defaultValue={v(K.defaultUnit)} />
        </Field>
        <Field label="Plazos para elegir de una lista" hint="Uno por renglón. Aparecen como opciones en la columna «Entrega». Ej.: Inmediata / 7 días / 15 días / A confirmar." wide>
          <Textarea name={name(K.deliveryOptions)} rows={4} defaultValue={v(K.deliveryOptions)} placeholder={"Inmediata\n7 días\n15 días\nA confirmar"} />
        </Field>
      </SettingsBatchForm>
    </>
  );

  const condiciones = (
    <SettingsBatchForm title="Pago, entrega y garantía" description="Lo que sale en el apartado «Condiciones comerciales» del PDF. Cada cotización nueva arranca con esto y se puede cambiar en esa cotización.">
      <Field label="¿Cuántos días vale la cotización?" hint="Ej.: 5 → «La oferta se mantiene por 5 días corridos».">
        <Input name={name(K.validityDays)} type="number" min={1} max={365} defaultValue={v(K.validityDays)} />
      </Field>
      <Field label="Forma de pago" hint="Ej.: «50% anticipo, saldo contra entrega» o «A convenir».">
        <Input name={name(K.paymentTerms)} defaultValue={v(K.paymentTerms)} />
      </Field>
      <Field label="Plazo de entrega (texto general)" hint="Va en las condiciones. El plazo de cada producto se maneja en la tabla." wide>
        <Textarea name={name(K.deliveryText)} rows={2} defaultValue={v(K.deliveryText)} />
      </Field>
      <Field label="Cómo se paga en pesos" hint="Ej.: a qué dólar se convierte el precio al pagar." wide>
        <Textarea name={name(K.paymentReference)} rows={3} defaultValue={v(K.paymentReference)} />
      </Field>
      <Field label="Garantía" wide>
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
    <SettingsBatchForm title="Número de cotización" description="Cómo se arma el número de cada cotización nueva.">
      <div className="rounded-lg bg-secondary/60 p-3 sm:col-span-2">
        <p className="text-xs text-muted-foreground">La próxima cotización va a salir con el número</p>
        <p className="mt-0.5 font-mono text-2xl font-semibold">
          {numberPreview({ prefix: v(K.prefix), includeDate: v(K.includeDate), dateToken: v(K.dateToken), separator: v(K.separator), padding: v(K.padding), next: v(K.nextSequence) })}
        </p>
      </div>
      <Field label="Letras del principio" hint="Ej.: COT">
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
      <Field label="Cantidad de dígitos" hint="Ej.: 5 → 00123">
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
        { href: "/admin/settings/quotes/textos", title: "Editar los textos del PDF", body: `Presentación, instalación, garantía, cierre… (${blocksCount} secciones). Cada uno con versiones por tipo de presupuesto y por rubro del cliente, que salen solas.` },
        { href: "/admin/settings/quotes/plantilla", title: "Ver el PDF de ejemplo", body: "Una cotización de muestra completa, para ver cómo queda todo junto. También se puede escribir encima." },
        { href: "/admin/settings/quotes/modulos", title: "Secciones opcionales", body: "Bloques que podés sumar a mano en una cotización (no salen solos)." },
        { href: "/admin/settings/quotes/clasificadores", title: "Datos internos de cada cotización", body: "Tipo de sala y tamaño. No salen en el PDF: sirven para sugerir equipos de proyectos parecidos." },
        { href: "/admin/settings/quotes/marcas", title: "Otros logos", body: "Logos que no son de una marca del catálogo (certificaciones, partners)." },
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
          { key: "documento", label: "Cómo sale el PDF", content: documento },
          { key: "condiciones", label: "Pago, entrega y garantía", content: condiciones },
          { key: "identidad", label: "Logos e imágenes", content: identidad },
          { key: "numeracion", label: "Número de cotización", content: numeracion },
          { key: "avanzado", label: "Textos del PDF", content: avanzado },
        ]}
      />
    </div>
  );
}
