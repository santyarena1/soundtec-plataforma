import { formatUsd } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { AI_SECTION_STUB, getCompanyIdentity } from "@/lib/quote-defaults";
import type { Quote, QuoteItem, QuoteSection, QuoteAsset, Client, User, QuoteCommercialTerms } from "@prisma/client";

type DocQuote = Quote & {
  client: Pick<Client, "id" | "companyName" | "tradeName"> | null;
  owner: Pick<User, "id" | "name" | "email" | "quoteSignName" | "quoteSignTitle">;
  items: QuoteItem[];
  sections: QuoteSection[];
  assets: QuoteAsset[];
  terms: QuoteCommercialTerms | null;
};

function isOn(section: QuoteSection) {
  return section.included !== false && (section.type === "products_table" || section.body.trim().length > 0 || section.type === "brands" || section.type === "iso" || section.type === "disciplines");
}

export async function QuoteDocument({ quote }: { quote: DocQuote }) {
  const identity = await getCompanyIdentity();
  const primary = identity.primary;
  const logo = identity.logoUrl;
  const productIds = quote.items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  const [itemBrands, catalogBrands] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { brand: { select: { id: true, name: true, logoUrl: true } } },
        })
      : Promise.resolve([]),
    prisma.brand.findMany({
      where: { isActive: true, logoUrl: { not: null } },
      take: 18,
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
  ]);
  const fromItems = itemBrands.map((p) => p.brand).filter((b): b is NonNullable<typeof b> => Boolean(b?.logoUrl));
  const brandLogos = (fromItems.length ? fromItems : catalogBrands).filter(
    (b, i, arr) => arr.findIndex((x) => x.id === b.id) === i
  );

  const total = quote.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0);
  const compact = quote.layoutKey === "COMPACT";
  const editorial = quote.layoutKey === "EDITORIAL";
  const sign = quote.owner.quoteSignName || quote.owner.name || "";
  const title = quote.owner.quoteSignTitle || "";
  const visible = quote.sections.filter((s) => s.included !== false);

  const contactLine = [identity.address, identity.phone, identity.email, identity.web].filter(Boolean).join(" · ");

  return (
    <article
      className={`mx-auto bg-white text-[#111] ${compact ? "max-w-[720px] text-[12px]" : "max-w-[860px] text-[13px]"} ${editorial ? "leading-relaxed" : "leading-snug"}`}
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <header className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: primary }}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="SOUNDTEC · integramos tecnología" className="h-16 w-auto max-w-[280px] object-contain" />
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold" style={{ color: primary }}>
            {quote.number}
          </p>
          <p className="text-[12px]">{quote.client?.companyName}</p>
          {quote.contactName ? <p className="text-[12px] text-neutral-600">{quote.contactName}</p> : null}
          {quote.issuedAt ? (
            <p className="text-[11px] text-neutral-500">{new Date(quote.issuedAt).toLocaleDateString("es-AR")}</p>
          ) : (
            <p className="text-[11px] text-neutral-500">Borrador</p>
          )}
        </div>
      </header>

      {quote.reference ? (
        <p className="mt-5 text-[15px] font-medium" style={{ color: primary }}>
          Ref.: {quote.reference}
        </p>
      ) : null}

      {visible.map((s) => {
        if (s.type === "products_table") {
          const photos = new Map(
            quote.assets.filter((a) => a.kind === "PRODUCT" && a.productId).map((a) => [a.productId as string, a])
          );
          return (
            <section key={s.id} className="mt-8">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: primary }}>
                Productos y servicios
              </h2>
              <div className="overflow-hidden rounded-md border" style={{ borderColor: `${primary}33` }}>
                <table className="w-full border-collapse" style={{ fontFamily: "Calibri, 'Segoe UI', sans-serif", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: primary, color: "#fff" }}>
                      <th className="w-[72px] px-2 py-2 text-left font-semibold">Foto</th>
                      <th className="w-12 px-2 py-2 text-right font-semibold">Cant</th>
                      <th className="w-10 px-2 py-2 text-left font-semibold">U</th>
                      <th className="px-2 py-2 text-left font-semibold">Detalle</th>
                      <th className="w-[92px] px-2 py-2 text-right font-semibold">Unit. USD</th>
                      <th className="w-[92px] px-2 py-2 text-right font-semibold">Total USD</th>
                      {quote.showDeliveryColumn ? <th className="w-24 px-2 py-2 text-left font-semibold">Entrega</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.length === 0 ? (
                      <tr>
                        <td colSpan={quote.showDeliveryColumn ? 7 : 6} className="px-3 py-10 text-center text-[13px] text-neutral-500">
                          Todavía no hay equipos. Cargalos en Planilla o generá la propuesta desde Brief y planos.
                        </td>
                      </tr>
                    ) : (
                      quote.items.map((i, idx) => {
                        const photo = i.productId ? photos.get(i.productId) : undefined;
                        return (
                          <tr key={i.id} className="align-top" style={{ background: idx % 2 ? "#f7f8fa" : "#fff" }}>
                            <td className="border-b border-neutral-200 p-2">
                              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-neutral-200 bg-white">
                                {photo?.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={photo.url} alt="" className="h-full w-full object-contain p-0.5" />
                                ) : (
                                  <span className="text-[9px] text-neutral-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="border-b border-neutral-200 px-2 py-2 text-right tabular-nums">{Number(i.quantity)}</td>
                            <td className="border-b border-neutral-200 px-2 py-2 text-neutral-600">{i.unit}</td>
                            <td className="border-b border-neutral-200 px-2 py-2 leading-snug">
                              <span className="whitespace-pre-wrap">{i.description}</span>
                              {i.optional ? <span className="ml-1 text-[10px] uppercase tracking-wide text-neutral-500">(opcional)</span> : null}
                            </td>
                            <td className="border-b border-neutral-200 px-2 py-2 text-right tabular-nums">{formatUsd(Number(i.unitPriceUsd))}</td>
                            <td className="border-b border-neutral-200 px-2 py-2 text-right font-medium tabular-nums">{formatUsd(Number(i.lineTotalUsd))}</td>
                            {quote.showDeliveryColumn ? (
                              <td className="border-b border-neutral-200 px-2 py-2 text-neutral-600">{i.deliveryKey || "—"}</td>
                            ) : null}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {quote.items.length > 0 ? (
                <div className="mt-3 flex justify-end border-t pt-2" style={{ borderColor: primary, fontFamily: "Calibri, 'Segoe UI', sans-serif" }}>
                  <div className="text-right">
                    <p className="text-[15px] font-semibold" style={{ color: primary }}>
                      Total neto {formatUsd(total)}
                    </p>
                    <p className="text-[11px] text-neutral-500">Precios en USD. No incluyen IVA salvo indicación.</p>
                  </div>
                </div>
              ) : null}
            </section>
          );
        }
        if (!isOn(s) && s.type !== "brands" && s.type !== "iso" && s.type !== "disciplines") return null;
        return (
          <section key={s.id} className="mt-5">
            <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide" style={{ color: primary }}>
              {s.title}
            </h2>
            {s.type === "disciplines" ? (
              <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: primary }}>
                {s.body}
              </p>
            ) : s.body.trim() && s.body.trim() !== AI_SECTION_STUB ? (
              <p className="whitespace-pre-wrap">{s.body}</p>
            ) : null}
            {s.type === "brands" ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={identity.brandsUrl} alt="Marcas representadas" className="w-full object-contain" />
                {brandLogos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
                    {brandLogos.map((b) => (
                      <div key={b.id} className="flex h-12 items-center justify-center border border-neutral-200 bg-white p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.logoUrl || ""} alt={b.name} className="max-h-10 max-w-full object-contain" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {s.type === "iso" ? (
              <div className="mt-3 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={identity.isoUrl} alt="ISO 9001 IRAM IQNet" className="h-24 w-auto object-contain" />
              </div>
            ) : null}
          </section>
        );
      })}

      {quote.assets.filter((a) => a.kind !== "PLAN" && a.kind !== "PRODUCT" && a.kind !== "CORPORATE").length > 0 ? (
        <section className="mt-6 grid grid-cols-2 gap-3">
          {quote.assets
            .filter((a) => a.kind !== "PLAN" && a.kind !== "PRODUCT" && a.kind !== "CORPORATE")
            .map((a) => (
              <figure key={a.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.caption || ""} className="max-h-48 w-full object-contain bg-neutral-50" />
                <figcaption className="mt-1 text-[10px] text-neutral-500">
                  {a.caption || (a.aiGenerated ? "Imagen conceptual" : "")}
                </figcaption>
              </figure>
            ))}
        </section>
      ) : null}

      <footer className="mt-10 border-t pt-4 text-[12px]" style={{ borderColor: primary }}>
        <p className="font-medium">{sign}</p>
        {title ? <p>{title}</p> : null}
        <p>SOUNDTEC S.R.L.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={identity.headerUrl} alt={contactLine} className="mt-4 w-full object-contain" />
      </footer>
    </article>
  );
}
