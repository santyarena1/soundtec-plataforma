import Link from "next/link";
import { notFound } from "next/navigation";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getDeliveryOptions } from "@/lib/quote-settings";
import { ensureQuoteSections, moduleByKey, parseQuoteStep, QUOTE_STEPS } from "@/lib/quote-defaults";
import { prisma } from "@/lib/prisma";
import { permissionsHave } from "@/lib/permissions";
import {
  addQuoteAccessory,
  saveQuoteMeta,
  saveQuoteSignature,
  saveQuoteTerms,
  toggleQuoteModule,
  toggleQuoteSectionLock,
} from "@/server/actions/quotes";
import { quoteIssueCheck } from "@/lib/quote-issue";
import { deleteQuoteAsset } from "@/server/actions/quote-images";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GenerateProposalButton } from "./generate-button";
import { QuoteImagesPanel } from "./images-panel";
import { QuoteIssueBar } from "./issue-bar";
import { QuotePlanUpload } from "./plan-upload";
import { QuoteWizardNav } from "./wizard-nav";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { QuoteProductPhotos } from "./product-photos";
import { QuoteBomTable } from "./quote-bom-table";
import { QuoteMediaRail } from "./media-rail";
import { QuoteRevisePanel, QuoteSectionWorkbench } from "./revise-panel";
import { QuoteSectionEditor } from "@/components/quotes/quote-section-editor";

export const metadata = { title: "Admin · Cotización" };

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === "string" ? x : ((x as { text?: string }).text || "")))
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function QuoteEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ paso?: string; autogen?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const step = parseQuoteStep(sp.paso);
  const autogen = sp.autogen === "1";
  const { quote: raw, forbidden, permissions, user } = await loadQuoteForUser(id);
  if (forbidden) notFound();
  if (!raw) notFound();
  await ensureQuoteSections(id);
  const { quote } = await loadQuoteForUser(id);
  if (!quote) notFound();

  const productIds = quote.items.map((i) => i.productId).filter((pid): pid is string => Boolean(pid));
  const [clients, deliveryOptions, catalogImages, accessories, signer, prevTerms] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    getDeliveryOptions(),
    productIds.length
      ? prisma.productImage.findMany({
          where: { productId: { in: productIds } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { productId: true, url: true },
        })
      : Promise.resolve([]),
    productIds.length
      ? prisma.accessoryRelation.findMany({
          where: { productId: { in: productIds } },
          include: {
            accessoryProduct: { select: { id: true, normalizedName: true, brand: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, quoteSignName: true, quoteSignTitle: true },
    }),
    quote.clientId
      ? prisma.quote.findFirst({
          where: { clientId: quote.clientId, id: { not: quote.id }, terms: { isNot: null } },
          orderBy: { updatedAt: "desc" },
          include: { terms: true },
        })
      : Promise.resolve(null),
  ]);

  const issued = quote.status === "ISSUED";
  const total = quote.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0);
  const canIssue = permissions.fullAccess || permissionsHave(permissions, "quotes.issue");
  const issueCheck = quoteIssueCheck(quote);
  const onQuoteProductIds = new Set(productIds);
  const accessoryHints = accessories.filter((a) => !onQuoteProductIds.has(a.accessoryProductId));
  const facts = texts(quote.context?.facts);
  const assumptions = texts(quote.context?.assumptions);
  const questions = texts(quote.context?.questions);
  const current = QUOTE_STEPS[step - 1];
  const aiSections = quote.sections.filter((s) => moduleByKey(s.type)?.kind === "ai");
  const templateSections = quote.sections.filter((s) => moduleByKey(s.type)?.kind !== "ai");
  const catalogByProduct = new Map<string, string>();
  for (const img of catalogImages) {
    if (!catalogByProduct.has(img.productId)) catalogByProduct.set(img.productId, img.url);
  }
  const productPhotoRows = quote.items
    .filter((i) => i.productId)
    .map((i) => {
      const asset = quote.assets.find((a) => a.productId === i.productId && a.kind === "PRODUCT");
      return {
        productId: i.productId as string,
        caption: i.description,
        currentUrl: asset?.url || null,
        catalogUrl: catalogByProduct.get(i.productId as string) || null,
      };
    });
  const plans = quote.assets.filter((a) => a.kind === "PLAN");
  const extraImages = quote.assets.filter((a) => a.kind !== "PLAN" && a.kind !== "CORPORATE");
  const bomRows = quote.items.map((i) => {
    const asset = i.productId ? quote.assets.find((a) => a.productId === i.productId && a.kind === "PRODUCT") : null;
    return {
      id: i.id,
      quantity: Number(i.quantity),
      unit: i.unit,
      description: i.description,
      unitPriceUsd: Number(i.unitPriceUsd),
      lineTotalUsd: Number(i.lineTotalUsd),
      ivaRate: Number(i.ivaRate),
      deliveryKey: i.deliveryKey || "",
      optional: i.optional,
      locked: i.locked,
      photoUrl: asset?.url || (i.productId ? catalogByProduct.get(i.productId) || null : null),
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={quote.number}
        description={
          <>
            {current.title} · {quote.reference || "Sin referencia"}
            {quote.sourceRequestId ? (
              <>
                {" · "}
                <a href={`/admin/requests/${quote.sourceRequestId}`} className="text-accent hover:underline">
                  Ver solicitud de origen
                </a>
              </>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone={issued ? "success" : quote.status === "IN_REVIEW" ? "warning" : "muted"}>
              {issued ? "Emitida" : quote.status === "IN_REVIEW" ? "En revisión" : "Borrador"}
            </Badge>
            <ButtonLink href={`/admin/quotes/${quote.id}/print`} size="sm" variant="outline">
              Vista PDF
            </ButtonLink>
          </div>
        }
      />
      <QuoteWizardNav quoteId={quote.id} step={step} />
      <QuoteMediaRail quoteId={quote.id} planCount={plans.length} imageCount={extraImages.length} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,42%)]">
        <div className="min-w-0 space-y-4">
          {step === 1 ? (
            <form action={saveQuoteMeta} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="metaKind" value="header" />
              <div>
                <Label htmlFor="clientId">Cliente</Label>
                <Select id="clientId" name="clientId" defaultValue={quote.clientId || ""} disabled={issued}>
                  <option value="">Sin cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="contactName">Contacto</Label>
                <Input id="contactName" name="contactName" defaultValue={quote.contactName || ""} disabled={issued} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="reference">Referencia</Label>
                <Input id="reference" name="reference" defaultValue={quote.reference || ""} disabled={issued} />
              </div>
              <div>
                <Label htmlFor="layoutKey">Layout visual</Label>
                <Select id="layoutKey" name="layoutKey" defaultValue={quote.layoutKey} disabled={issued}>
                  <option value="COMPACT">Compacto</option>
                  <option value="STANDARD">Estándar</option>
                  <option value="EDITORIAL">Editorial</option>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="showDeliveryColumn" defaultChecked={quote.showDeliveryColumn} disabled={issued} />
                  Columna entrega
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="alternativesEnabled" defaultChecked={quote.alternativesEnabled} disabled={issued} />
                  Alternativas
                </label>
              </div>
              {!issued ? (
                <Button type="submit" size="sm">
                  Guardar y seguir
                </Button>
              ) : null}
            </form>
          ) : null}
          {step === 1 && prevTerms?.terms ? (
            <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              Este cliente ya tuvo condiciones propias. En Emitir podés elegir “las que este cliente usó antes”.
            </p>
          ) : null}

          {step === 2 ? (
            <Card>
              <CardContent className="space-y-5 p-5">
                <p className="text-sm text-muted-foreground">
                  Prompt + planos. La IA arma un borrador editable. No toca módulos fijos ni inventa precios.
                </p>
                <form action={saveQuoteMeta} className="space-y-2">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="metaKind" value="brief" />
                  <Label htmlFor="brief">Brief del proyecto</Label>
                  <Textarea id="brief" name="brief" rows={8} defaultValue={quote.brief || ""} disabled={issued} className="min-h-[160px]" />
                  {!issued ? (
                    <Button type="submit" size="sm" variant="outline">
                      Guardar brief
                    </Button>
                  ) : null}
                </form>
                <QuotePlanUpload quoteId={quote.id} plans={plans} disabled={issued} />
                {!issued ? <GenerateProposalButton quoteId={quote.id} auto={autogen} /> : null}
                {facts.length || assumptions.length || questions.length ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <h3 className="text-sm font-medium">Hechos</h3>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {facts.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Supuestos</h3>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {assumptions.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Preguntas</h3>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {questions.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Textos e imágenes fijos de las COT Word. Tildá lo que va, editá con el engranaje o pedile a la IA
                un ajuste (más largo, más claro, más institucional). Generar la propuesta no los pisa.{" "}
                <Link href="/admin/settings/quotes/plantilla" className="underline">
                  Editar la plantilla maestra
                </Link>
                .
              </p>
              {templateSections.map((section) => {
                const def = moduleByKey(section.type);
                return (
                  <Card key={section.id}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{section.title}</h3>
                          <p className="text-xs text-muted-foreground">{def?.description}</p>
                        </div>
                        {section.type === "products_table" ? (
                          <Badge tone="success">Siempre</Badge>
                        ) : (
                          <form action={toggleQuoteModule}>
                            <input type="hidden" name="sectionId" value={section.id} />
                            <Button type="submit" size="sm" variant={section.included ? "primary" : "outline"} disabled={issued}>
                              {section.included ? "Incluido" : "No va"}
                            </Button>
                          </form>
                        )}
                      </div>
                      {section.type !== "products_table" ? (
                        <>
                          <QuoteSectionEditor
                            sectionId={section.id}
                            title={section.title}
                            body={section.body}
                            issued={issued}
                          />
                          {!issued ? (
                            <QuoteRevisePanel
                              quoteId={quote.id}
                              nodeId={section.id}
                              kind="section"
                              alwaysOpen
                              warning="Sólo esta cotización. La plantilla maestra no cambia."
                            />
                          ) : null}
                        </>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <QuoteBomTable
                quoteId={quote.id}
                items={bomRows}
                deliveryOptions={deliveryOptions}
                showDelivery={quote.showDeliveryColumn}
                issued={issued}
                total={total}
              />
              {accessoryHints.length > 0 && !issued ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="mb-2 text-xs font-medium">Accesorios del catálogo que suelen ir con estos productos</p>
                  <ul className="space-y-1">
                    {accessoryHints.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {a.accessoryProduct.brand?.name ? `${a.accessoryProduct.brand.name} · ` : ""}
                          {a.accessoryProduct.normalizedName}
                          {a.isRequired ? " (requerido)" : ""}
                        </span>
                        <form action={addQuoteAccessory}>
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <input type="hidden" name="productId" value={a.accessoryProductId} />
                          <input type="hidden" name="quantity" value="1" />
                          <Button type="submit" size="sm" variant="outline">
                            Agregar
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Sólo textos de proyecto. Lo institucional está en Plantilla.</p>
              {aiSections.map((section) => (
                <Card key={section.id}>
                  <CardContent className="space-y-2 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{section.title}</h3>
                        <p className="text-xs text-muted-foreground">{moduleByKey(section.type)?.description}</p>
                      </div>
                      {section.included ? <Badge tone="success">En el documento</Badge> : <Badge tone="muted">Apagado</Badge>}
                    </div>
                    <QuoteSectionEditor
                      sectionId={section.id}
                      title={section.title}
                      body={section.body}
                      issued={issued}
                    />
                    {!issued ? (
                      <div className="space-y-2">
                        <form action={toggleQuoteSectionLock}>
                          <input type="hidden" name="sectionId" value={section.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            {section.locked ? "Desfijar" : "Fijar"}
                          </Button>
                        </form>
                        <QuoteRevisePanel quoteId={quote.id} nodeId={section.id} kind="section" alwaysOpen />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-6">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <p className="text-sm text-muted-foreground">
                    Foto de producto: catálogo, Serper o archivo propio. No reemplaza el collage institucional.
                  </p>
                  {!issued ? (
                    <QuoteProductPhotos quoteId={quote.id} rows={productPhotoRows} />
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {quote.assets
                        .filter((a) => a.kind === "PRODUCT")
                        .map((a) => (
                          <figure key={a.id} className="overflow-hidden rounded-md border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt={a.caption || ""} className="h-28 w-full object-contain" />
                            <figcaption className="truncate p-1 text-[10px] text-muted-foreground">{a.caption}</figcaption>
                          </figure>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-4 p-5">
                  <h3 className="font-medium">Aplicación, obra o esquemas</h3>
                  {extraImages.filter((a) => a.kind !== "PRODUCT").length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {extraImages
                        .filter((a) => a.kind !== "PRODUCT")
                        .map((a) => (
                          <figure key={a.id} className="overflow-hidden rounded-md border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt={a.caption || ""} className="h-28 w-full object-cover" />
                            <figcaption className="flex items-center justify-between gap-1 p-1 text-[10px] text-muted-foreground">
                              <span className="truncate">{a.caption || a.kind}</span>
                              {!issued && !a.locked ? (
                                <form action={deleteQuoteAsset}>
                                  <input type="hidden" name="assetId" value={a.id} />
                                  <Button type="submit" size="sm" variant="ghost">
                                    Quitar
                                  </Button>
                                </form>
                              ) : null}
                            </figcaption>
                          </figure>
                        ))}
                    </div>
                  ) : null}
                  {!issued ? <QuoteImagesPanel quoteId={quote.id} /> : null}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {step === 7 ? (
            <div className="space-y-6">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h2 className="heading-3">Condiciones</h2>
                  <form action={saveQuoteTerms} className="space-y-3">
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <div>
                      <Label htmlFor="termsSource">Origen</Label>
                      <Select id="termsSource" name="termsSource" defaultValue={quote.termsSource} disabled={issued}>
                        <option value="SYSTEM">Del sistema</option>
                        <option value="CLIENT_PREVIOUS">Las que este cliente usó antes</option>
                        <option value="CUSTOM">Nuevas para esta COT</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="paymentTerms">Forma de pago</Label>
                      <Textarea id="paymentTerms" name="paymentTerms" rows={2} defaultValue={quote.terms?.paymentTerms || ""} disabled={issued} />
                    </div>
                    <div>
                      <Label htmlFor="paymentReference">Referencia de pago</Label>
                      <Textarea id="paymentReference" name="paymentReference" rows={3} defaultValue={quote.terms?.paymentReference || ""} disabled={issued} />
                    </div>
                    <div>
                      <Label htmlFor="validityDays">Vigencia (días)</Label>
                      <Input id="validityDays" name="validityDays" defaultValue={quote.terms?.validityDays ?? 5} disabled={issued} />
                    </div>
                    {!issued ? (
                      <Button type="submit" size="sm" variant="outline">
                        Guardar condiciones
                      </Button>
                    ) : null}
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h2 className="heading-3">Checklist para emitir</h2>
                  {issueCheck.errors.length === 0 && issueCheck.warnings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Lista para emitir.</p>
                  ) : null}
                  {issueCheck.errors.map((e) => (
                    <p key={e} className="text-sm text-destructive">
                      {e}
                    </p>
                  ))}
                  {issueCheck.warnings.map((w) => (
                    <p key={w} className="text-sm text-muted-foreground">
                      {w}
                    </p>
                  ))}
                  <form action={saveQuoteSignature} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <div>
                      <Label htmlFor="quoteSignName">Tu firma (nombre)</Label>
                      <Input id="quoteSignName" name="quoteSignName" defaultValue={signer?.quoteSignName || signer?.name || ""} />
                    </div>
                    <div>
                      <Label htmlFor="quoteSignTitle">Cargo</Label>
                      <Input id="quoteSignTitle" name="quoteSignTitle" defaultValue={signer?.quoteSignTitle || ""} />
                    </div>
                    <Button type="submit" size="sm" variant="outline">
                      Guardar firma
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/admin/quotes/${quote.id}/print`} size="sm">
                  PDF / imprimir
                </ButtonLink>
                <ButtonLink href={`/api/admin/quotes/${quote.id}/word`} size="sm" variant="outline">
                  Word
                </ButtonLink>
                <ButtonLink href={`/api/admin/quotes/${quote.id}/excel`} size="sm" variant="outline">
                  Excel
                </ButtonLink>
                <QuoteIssueBar quoteId={quote.id} canIssue={canIssue} issued={issued} />
              </div>
            </div>
          ) : null}
        </div>

        <aside className="xl:sticky xl:top-4">
          <div className="overflow-hidden rounded-xl border border-border bg-neutral-200/60 shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
              <span className="text-[11px] text-muted-foreground">{quote.items.length} ítems</span>
            </div>
            <div className="max-h-[calc(100vh-8rem)] overflow-auto bg-neutral-300/40 p-3">
              <div className="quote-preview">
                <QuoteDocument quote={quote} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
