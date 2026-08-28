import { formatUsd } from "@/lib/utils";
import {
  AI_SECTION_STUB,
  DEFAULT_BRANDS_PLACEMENT,
  DEFAULT_ISO_PLACEMENT,
  getCompanyIdentity,
  resolveImagePlacement,
  type ImagePlacement,
} from "@/lib/quote-defaults";
import { QuoteBody } from "@/components/quotes/quote-body";
import { QuoteBrandsGrid } from "@/components/quotes/quote-brands-grid";
import { resolveQuoteBrandsDisplayMode, visibleQuoteBrandLogos, type QuoteBrandLogoView } from "@/lib/quote-brands";
import { ModuleMediaLayout } from "@/components/quotes/module-media-layout";
import { quoteItemDisplay } from "@/lib/quote-product-line";
import { displayImageCaption } from "@/lib/quote-image-caption";
import { buildQuoteZones } from "@/lib/quote-item-groups";
import type { Quote, QuoteItem, QuoteSection, QuoteAsset, Client, User, QuoteCommercialTerms, Product } from "@prisma/client";

type QuoteItemWithProduct = QuoteItem & {
  product?: (Pick<Product, "normalizedName" | "shortDescription"> & { brand?: { name: string } | null }) | null;
};

type DocQuote = Quote & {
  client: Pick<Client, "id" | "companyName" | "tradeName"> | null;
  owner: Pick<User, "id" | "name" | "email" | "quoteSignName" | "quoteSignTitle">;
  items: QuoteItemWithProduct[];
  itemGroups?: { id: string; title: string; body: string; sortOrder: number }[];
  sections: QuoteSection[];
  assets: QuoteAsset[];
  terms: QuoteCommercialTerms | null;
};

type Identity = Awaited<ReturnType<typeof getCompanyIdentity>>;

function hasBody(section: QuoteSection) {
  const body = (section.body ?? "").trim();
  return body.length > 0 && body !== AI_SECTION_STUB;
}

function longDate(value: Date | null) {
  const date = value ?? new Date();
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

const Paragraphs = QuoteBody;

/** Imagen que fluye con el texto: se controla ancho y alineación, nunca posición libre. */
function PlacedImage({
  src,
  alt,
  placement,
  fallback = DEFAULT_BRANDS_PLACEMENT,
}: {
  src: string;
  alt: string;
  placement?: ImagePlacement | null;
  fallback?: ImagePlacement;
}) {
  const safe = resolveImagePlacement(placement, fallback);
  const margin = safe.align === "center" ? "0 auto" : safe.align === "right" ? "0 0 0 auto" : "0 auto 0 0";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="mt-[3mm] block" style={{ width: `${safe.width}%`, margin }} />
  );
}

/** Los títulos de la COT Word terminan con guion largo. */
function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2
      className="mb-[2.5mm] border-b pb-[1mm] text-[11pt] font-bold uppercase tracking-[0.08em]"
      style={{ color, borderColor: color }}
    >
      {children} <span className="font-normal">–</span>
    </h2>
  );
}

function ProductsTable({
  quote,
  photos,
  color,
  items,
  totalLabel = "Total",
  showNote = true,
}: {
  quote: DocQuote;
  photos: Map<string, QuoteAsset>;
  color: string;
  items?: QuoteItemWithProduct[];
  totalLabel?: string;
  showNote?: boolean;
}) {
  const visible = (items ?? quote.items).filter((item) => !item.excluded);
  const total = visible.filter((item) => !item.optional).reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
  const showDelivery = quote.showDeliveryColumn;
  const anyPhoto = visible.some((item) => item.productId && photos.has(item.productId));

  if (visible.length === 0) {
    return (
      <p className="border border-dashed border-neutral-300 px-[6mm] py-[10mm] text-center text-[10pt] text-neutral-500">
        Todavía no hay equipos cargados. Completá la planilla o generá la propuesta desde Brief y planos.
      </p>
    );
  }

  const cols = 4 + (anyPhoto ? 1 : 0) + 2 + 1 + (showDelivery ? 1 : 0);

  return (
    <>
      <table className="w-full table-fixed border-collapse text-[9pt]">
        <colgroup>
          <col style={{ width: "8mm" }} />
          {anyPhoto ? <col style={{ width: "20mm" }} /> : null}
          <col style={{ width: "12mm" }} />
          <col style={{ width: "9mm" }} />
          <col />
          <col style={{ width: "21mm" }} />
          <col style={{ width: "23mm" }} />
          <col style={{ width: "11mm" }} />
          {showDelivery ? <col style={{ width: "21mm" }} /> : null}
        </colgroup>
        <thead>
          <tr style={{ background: color, color: "#fff" }}>
            <th className="px-[2mm] py-[1.6mm] text-right font-semibold">#</th>
            {anyPhoto ? <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Foto</th> : null}
            <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Cant.</th>
            <th className="px-[2mm] py-[1.6mm] text-left font-semibold">U</th>
            <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Detalle</th>
            <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Unit.</th>
            <th className="px-[2mm] py-[1.6mm] text-right font-semibold">Total</th>
            <th className="px-[2mm] py-[1.6mm] text-right font-semibold">IVA</th>
            {showDelivery ? <th className="px-[2mm] py-[1.6mm] text-left font-semibold">Entrega</th> : null}
          </tr>
        </thead>
        <tbody>
          {          visible.map((item, index) => {
            const photo = item.productId ? photos.get(item.productId) : undefined;
            const line = quoteItemDisplay(item);
            return (
              <tr key={item.id} className="align-top" style={{ background: index % 2 ? "#f3f5f8" : "#fff" }}>
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums text-neutral-500">
                  {index + 1}
                </td>
                {anyPhoto ? (
                  <td className="border-b border-neutral-200 px-[1.5mm] py-[1.5mm]">
                    {photo?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt="" className="h-[16mm] w-[16mm] object-contain" />
                    ) : null}
                  </td>
                ) : null}
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">
                  {Number(item.quantity)}
                </td>
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm]">{item.unit}</td>
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] leading-[1.35]">
                  <span className="quote-product-name">{line.name}</span>
                  {line.blurb ? <p className="quote-product-blurb">{line.blurb}</p> : null}
                  {item.optional ? (
                    <span className="ml-1 text-[7.5pt] font-semibold uppercase tracking-wide text-neutral-500">
                      Opcional
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">
                  {formatUsd(Number(item.unitPriceUsd))}
                </td>
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right font-semibold tabular-nums">
                  {formatUsd(Number(item.lineTotalUsd))}
                </td>
                <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm] text-right tabular-nums">
                  {Number(item.ivaRate)}
                </td>
                {showDelivery ? (
                  <td className="border-b border-neutral-200 px-[2mm] py-[1.8mm]">{item.deliveryKey || "—"}</td>
                ) : null}
              </tr>
            );
          })}
          <tr style={{ background: color, color: "#fff" }}>
            <td className="px-[2mm] py-[2mm] text-right font-bold uppercase tracking-[0.08em]" colSpan={cols - 3}>
              {totalLabel}
            </td>
            <td className="px-[2mm] py-[2mm] text-right text-[10.5pt] font-bold tabular-nums">{formatUsd(total)}</td>
            <td colSpan={showDelivery ? 2 : 1} />
          </tr>
        </tbody>
      </table>

      {showNote ? (
        <p className="quote-doc__block mt-[2.5mm] text-[8.5pt] leading-snug text-neutral-600">
          Precios expresados en DÓLARES billete según tipo de cambio vendedor del BNA. No incluyen IVA.
          {visible.some((item) => item.optional) ? " Los ítems marcados como opcionales no se suman al total." : ""}
        </p>
      ) : null}
    </>
  );
}

function TermsDetail({ quote, color }: { quote: DocQuote; color: string }) {
  const terms = quote.terms;
  if (!terms) return null;
  const rows: [string, string][] = [];
  if (terms.paymentTerms) rows.push(["Forma de pago", terms.paymentTerms]);
  if (terms.deliveryText) rows.push(["Plazo de entrega", terms.deliveryText]);
  rows.push(["Mantenimiento de la oferta", `${terms.validityDays} días corridos`]);
  if (rows.length === 0) return null;
  return (
    <table className="mt-[3mm] w-full border-collapse text-[9.5pt]">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td
              className="w-[52mm] border-b border-neutral-200 py-[1.4mm] pr-[3mm] align-top font-semibold"
              style={{ color }}
            >
              {label}
            </td>
            <td className="border-b border-neutral-200 py-[1.4mm] align-top">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SectionBlock({
  section,
  quote,
  identity,
  photos,
  brandsMode,
  brandLogos,
}: {
  section: QuoteSection;
  quote: DocQuote;
  identity: Identity;
  photos: Map<string, QuoteAsset>;
  brandsMode: "collage" | "individual";
  brandLogos: QuoteBrandLogoView[];
}) {
  const color = identity.primary || "#1e3553";
  const spacing = "mt-[7mm]";

  if (section.type === "letter_open") {
    return (
      <div className="quote-doc__block mt-[7mm]">
        <Paragraphs body={section.body} />
      </div>
    );
  }

  if (section.type === "disciplines") {
    return (
      <div
        className="quote-doc__block mt-[7mm] px-[4mm] py-[2.5mm] text-center text-[10pt] font-semibold uppercase tracking-[0.14em] text-white"
        style={{ background: color }}
      >
        {section.body}
      </div>
    );
  }

  if (section.type === "brands") {
    return (
      <div className={`quote-doc__block ${spacing}`}>
        <SectionTitle color={color}>{section.title}</SectionTitle>
        {hasBody(section) ? <Paragraphs body={section.body} /> : null}
        {brandsMode === "individual" && brandLogos.length > 0 ? (
          <QuoteBrandsGrid logos={brandLogos} className="mt-[3mm]" />
        ) : (
          <PlacedImage
            src={identity.brandsUrl}
            alt="Marcas representadas por SOUNDTEC"
            placement={identity.brands}
            fallback={DEFAULT_BRANDS_PLACEMENT}
          />
        )}
      </div>
    );
  }

  if (section.type === "iso") {
    return (
      <div className={`quote-doc__block ${spacing}`}>
        <SectionTitle color={color}>{section.title}</SectionTitle>
        {hasBody(section) ? <Paragraphs body={section.body} /> : null}
        <PlacedImage
          src={identity.isoUrl}
          alt="ISO 9001 · IRAM · IQNet"
          placement={identity.iso}
          fallback={DEFAULT_ISO_PLACEMENT}
        />
      </div>
    );
  }

  if (section.type === "products_table") {
    const zones = buildQuoteZones(
      quote.items.filter((item) => !item.excluded),
      quote.itemGroups ?? []
    );
    const multi = (quote.itemGroups?.length ?? 0) > 0;
    const grand = quote.items
      .filter((item) => !item.excluded && !item.optional)
      .reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
    return (
      <div className={spacing}>
        {zones.map((zone) => (
          <div key={zone.id || "general"} className="quote-doc__block mt-[7mm] first:mt-0">
            <SectionTitle color={color}>{zone.title}</SectionTitle>
            {zone.body.trim() ? <Paragraphs body={zone.body} /> : null}
            <ProductsTable
              quote={quote}
              photos={photos}
              color={color}
              items={zone.items}
              totalLabel={multi ? `Subtotal ${zone.title}` : "Total"}
              showNote={!multi}
            />
          </div>
        ))}
        {multi ? (
          <>
            <p className="mt-[4mm] text-right text-[12pt] font-bold" style={{ color }}>
              Total neto {formatUsd(grand)}
            </p>
            <p className="quote-doc__block mt-[2.5mm] text-[8.5pt] leading-snug text-neutral-600">
              Precios expresados en DÓLARES billete según tipo de cambio vendedor del BNA. No incluyen IVA.
            </p>
          </>
        ) : null}
      </div>
    );
  }

  if (section.type === "commercial_terms") {
    if (!hasBody(section) && !quote.terms) return null;
    return (
      <div className={`quote-doc__block ${spacing}`}>
        <SectionTitle color={color}>{section.title}</SectionTitle>
        {hasBody(section) ? <Paragraphs body={section.body} /> : null}
        <TermsDetail quote={quote} color={color} />
      </div>
    );
  }

  if (section.type === "closing") {
    if (!hasBody(section)) return null;
    return (
      <div className="quote-doc__block mt-[7mm]">
        <Paragraphs body={section.body} />
      </div>
    );
  }

  if (!hasBody(section) && !quote.assets.some((asset) => asset.sectionId === section.id)) return null;

  const images = quote.assets
    .filter((asset) => asset.sectionId === section.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((asset) => ({ id: asset.id, url: asset.url, caption: asset.caption }));

  return (
    <div className={`quote-doc__block ${spacing}`}>
      <SectionTitle color={color}>{section.title}</SectionTitle>
      <ModuleMediaLayout layout={section.layout} images={images}>
        {hasBody(section) ? <Paragraphs body={section.body} /> : null}
      </ModuleMediaLayout>
    </div>
  );
}

function DocumentBody({
  quote,
  identity,
  photos,
  plans,
  gallery,
  brandsMode,
  brandLogos,
}: {
  quote: DocQuote;
  identity: Identity;
  photos: Map<string, QuoteAsset>;
  plans: QuoteAsset[];
  gallery: QuoteAsset[];
  brandsMode: "collage" | "individual";
  brandLogos: QuoteBrandLogoView[];
}) {
  const color = identity.primary || "#1e3553";
  const sections = [...quote.sections]
    .filter((section) => section.included !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const signName = quote.owner.quoteSignName || quote.owner.name || "";
  const signTitle = quote.owner.quoteSignTitle || "";

  return (
    <>
      <p className="text-right text-[10pt] text-neutral-700">Buenos Aires, {longDate(quote.issuedAt)}</p>

      <div className="quote-doc__block mt-[6mm]">
        <p className="font-semibold" style={{ color }}>
          A
        </p>
        <p className="text-[12pt] font-bold uppercase">{quote.client?.companyName || "[Cliente a confirmar]"}</p>
        {quote.contactName ? <p className="text-[10pt]">At.: {quote.contactName}</p> : null}
        <p className="mt-[3mm]">
          <span className="font-semibold" style={{ color }}>
            Ref:
          </span>{" "}
          {quote.reference || "[Referencia a confirmar]"}
        </p>
        <p>
          <span className="font-semibold" style={{ color }}>
            Presupuesto:
          </span>{" "}
          <span className="font-bold tracking-wide" style={{ color }}>
            {quote.number}
          </span>
        </p>
      </div>

      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          quote={quote}
          identity={identity}
          photos={photos}
          brandsMode={brandsMode}
          brandLogos={brandLogos}
        />
      ))}

      <div className="quote-doc__block quote-doc__keep mt-[9mm]">
        <p className="font-semibold">{signName}</p>
        {signTitle ? <p className="text-[10pt]">{signTitle}</p> : null}
        <p className="text-[10pt] font-semibold tracking-[0.35em]" style={{ color }}>
          {identity.name} s.r.l.
        </p>
      </div>

      {plans.length > 0 ? (
        <div className="quote-doc__newpage">
          <SectionTitle color={color}>Planos y relevamiento</SectionTitle>
          <div className="grid grid-cols-1 gap-[5mm]">
            {plans.map((plan) => (
              <figure key={plan.id} className="quote-doc__block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={plan.url} alt={plan.caption || "Plano"} className="max-h-[150mm] w-full object-contain" />
                {plan.caption && displayImageCaption(plan.caption) ? (
                  <figcaption className="mt-[1.5mm] text-center text-[8.5pt] text-neutral-600">
                    {displayImageCaption(plan.caption)}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      {gallery.length > 0 ? (
        <div className="quote-doc__newpage">
          <SectionTitle color={color}>Imágenes de referencia</SectionTitle>
          <div className="grid grid-cols-2 gap-[5mm]">
            {gallery.map((asset) => {
              const caption = displayImageCaption(asset.caption, asset.aiGenerated ? "Imagen conceptual" : "");
              return (
                <figure key={asset.id} className="quote-doc__block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={caption || ""} className="h-[62mm] w-full bg-neutral-50 object-contain" />
                  {caption ? (
                    <figcaption className="mt-[1.5mm] text-[8.5pt] text-neutral-600">{caption}</figcaption>
                  ) : null}
                </figure>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}

export async function QuoteDocument({ quote }: { quote: DocQuote }) {
  const rawIdentity = await getCompanyIdentity();
  const identity = {
    ...rawIdentity,
    primary: rawIdentity.primary || "#1e3553",
    brands: resolveImagePlacement(rawIdentity.brands, DEFAULT_BRANDS_PLACEMENT),
    iso: resolveImagePlacement(rawIdentity.iso, DEFAULT_ISO_PLACEMENT),
  };

  const [brandLogos, brandsMode] = await Promise.all([
    visibleQuoteBrandLogos(quote.id),
    resolveQuoteBrandsDisplayMode(quote.id),
  ]);

  const photos = new Map(
    quote.assets
      .filter((asset) => asset.kind === "PRODUCT" && asset.productId)
      .map((asset) => [asset.productId as string, asset])
  );
  const plans = quote.assets.filter((asset) => asset.kind === "PLAN" && !/\.pdf($|\?)/i.test(asset.url));
  const gallery = quote.assets.filter(
    (asset) =>
      asset.kind !== "PRODUCT" &&
      asset.kind !== "CORPORATE" &&
      asset.kind !== "PLAN" &&
      !asset.sectionId
  );

  // thead/tfoot es la única forma fiable de que las bandas corporativas
  // se repitan en todas las hojas al imprimir.
  return (
    <table className="quote-doc">
      <thead className="quote-doc__header">
        <tr>
          <td>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={identity.logoUrl} alt={`${identity.name} · ${identity.tagline}`} className="quote-doc__band" />
          </td>
        </tr>
      </thead>
      <tfoot className="quote-doc__footer">
        <tr>
          <td>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={identity.headerUrl} alt={identity.address} className="quote-doc__band" />
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="quote-doc__inner">
            <DocumentBody
              quote={quote}
              identity={identity}
              photos={photos}
              plans={plans}
              gallery={gallery}
              brandsMode={brandsMode}
              brandLogos={brandLogos}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
