"use client";

import { TAX_MODES } from "@/lib/quote-totals";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { ProductSearchPicker, type PickerItem } from "@/components/products/product-search-picker";
import { ClientSelectWithCreate } from "@/components/admin/client-select-with-create";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { QuickQuoteItems, type QuickItem, type TaxMode } from "./quick-quote-items";
import { resolveQuickQuoteSkus, saveQuickQuote, searchQuickQuoteProducts } from "@/server/actions/quick-quote";

type Product = Awaited<ReturnType<typeof searchQuickQuoteProducts>>[number];

let uidSeq = 0;
const newUid = () => `l${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

export type QuickInitial = {
  id: string;
  number: string;
  status: string;
  pdfOutdated: boolean;
  clientId: string | null;
  clientName: string;
  contactName: string;
  reference: string;
  profileKey: string;
  audience: string;
  taxMode: TaxMode;
  validityDays: number;
  showProductPhotos: boolean;
  items: QuickItem[];
};

export function QuickQuoteForm({
  clients,
  owners,
  priceLists,
  validityDays,
  canIssue,
  defaultIva,
  defaults,
  documentTypes,
  audiences,
  initial,
}: {
  clients: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  priceLists: { id: string; name: string }[];
  validityDays: number;
  /** Puede generar el PDF para el cliente. */
  canIssue: boolean;
  defaultIva: number;
  /** Valores de Configuración → Cotizaciones. */
  defaults: { profileKey: string; taxMode: TaxMode };
  documentTypes: { key: string; name: string; audience: string | null }[];
  audiences: { key: string; label: string }[];
  /** Cotización rápida ya guardada que se está editando. */
  initial?: QuickInitial | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [contact, setContact] = useState(initial?.contactName ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [profileKey, setProfileKey] = useState(initial?.profileKey ?? defaults.profileKey);
  const [audience, setAudience] = useState(initial ? initial.audience : "auto");
  const [taxMode, setTaxMode] = useState<TaxMode>(initial?.taxMode ?? defaults.taxMode);
  const [validity, setValidity] = useState(initial?.validityDays ?? validityDays);
  const [showPhotos, setShowPhotos] = useState(initial?.showProductPhotos ?? true);
  const found = useRef(new Map<string, Product>());
  const [items, setItems] = useState<QuickItem[]>(initial?.items ?? []);
  const [bulk, setBulk] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [issued, setIssued] = useState<{ quoteId: string; number: string; pdfUrl?: string } | null>(null);
  const editing = Boolean(initial);

  const search = useCallback(
    async (q: string): Promise<PickerItem[]> => {
      const rows = await searchQuickQuoteProducts(q, clientId || null);
      found.current = new Map(rows.map((p) => [p.id, p]));
      return rows.map((p) => ({ id: p.id, title: p.name, subtitle: p.subtitle, brand: p.brand, code: p.tango, imageUrl: p.imageUrl, price: p.price }));
    },
    [clientId],
  );
  // Al cambiar el cliente, se recalculan los precios de lista con sus condiciones (no los libres ni los incluidos).
  const firstClient = useRef(true);
  useEffect(() => {
    if (firstClient.current) {
      firstClient.current = false;
      return;
    }
    const lines = items.filter((item) => !item.included && !item.free && item.productId);
    if (!lines.length) return;
    Promise.all(lines.map((item) => searchQuickQuoteProducts(item.sku || item.name, clientId || null))).then((sets) => {
      const priceByUid = new Map(lines.map((item, i) => [item.uid, sets[i]?.find((p) => p.id === item.productId)?.price]));
      setItems((old) => old.map((item) => (priceByUid.has(item.uid) ? { ...item, unitPriceUsd: priceByUid.get(item.uid) ?? item.unitPriceUsd } : item)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  /**
   * Agrega el producto como línea nueva (se puede repetir: ej. el soporte que viene sin
   * cargo y otro soporte cobrado). Lo que la ficha marca «incluido» va abajo, sin cargo,
   * y sigue la cantidad del producto.
   */
  function add(product: Product, quantity = 1) {
    const uid = newUid();
    const line: QuickItem = {
      uid,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      quantity,
      unitPriceUsd: product.price,
      discountPercent: 0,
      note: "",
      included: false,
      ivaPercent: product.ivaPercent,
      subtitle: product.subtitle,
    };
    const included: QuickItem[] = product.accessories
      .filter((a) => a.kind === "INCLUDED")
      .map((a) => ({
        uid: newUid(),
        productId: a.id,
        name: a.name,
        sku: a.sku,
        quantity: quantity * a.quantity,
        unitPriceUsd: 0,
        discountPercent: 0,
        note: "",
        included: true,
        ivaPercent: a.ivaPercent,
        parentUid: uid,
        perParent: a.quantity,
      }));
    setItems((old) => [...old, line, ...included]);
  }

  /** Ítem libre: algo que no está en el catálogo (un servicio, un material, un equipo puntual). */
  function addFree() {
    setItems((old) => [
      ...old,
      { uid: newUid(), productId: "", free: true, name: "", sku: null, quantity: 1, unitPriceUsd: 0, discountPercent: 0, note: "", included: false, ivaPercent: null },
    ]);
  }

  function save(issue: boolean) {
    setErrors([]);
    start(async () => {
      const result = await saveQuickQuote({
        quoteId: initial?.id ?? null,
        clientId: clientId || null,
        clientName: clientId ? "" : clientName,
        contactName: contact,
        reference,
        profileKey,
        audience,
        taxMode,
        validityDays: validity,
        showProductPhotos: showPhotos,
        issue,
        items: items.map((i) => ({
          uid: i.uid,
          productId: i.free ? null : i.productId,
          name: i.name,
          quantity: i.quantity,
          unitPriceUsd: i.unitPriceUsd,
          discountPercent: i.discountPercent,
          note: i.note,
          included: i.included,
          parentUid: i.parentUid ?? null,
          perParent: i.perParent ?? null,
        })),
      });
      if (!result.ok) return setErrors(result.errors || ["No se pudo guardar la cotización."]);
      if (issue) {
        setIssued({ quoteId: result.quoteId!, number: result.number!, pdfUrl: result.pdfUrl });
        return;
      }
      toast.success(`Cotización ${result.number} guardada.`);
      // Se queda en la rápida: guardar no la convierte en una cotización común.
      if (!editing) router.replace(`/admin/quotes/quick?editar=${result.quoteId}`);
      else router.refresh();
    });
  }

  if (issued)
    return (
      <div className="space-y-4 rounded-lg border border-success/30 bg-success/5 p-6">
        <h2 className="text-xl font-semibold">Cotización {issued.number}: PDF generado</h2>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={issued.pdfUrl || `/api/quotes/${issued.quoteId}/pdf`} target="_blank">
            Ver el PDF
          </ButtonLink>
          <ButtonLink variant="outline" href={`/admin/quotes/quick?editar=${issued.quoteId}`}>
            Seguir editando
          </ButtonLink>
          <ButtonLink variant="ghost" href="/admin/quotes/quick">
            Nueva cotización rápida
          </ButtonLink>
        </div>
        <p className="text-sm text-muted-foreground">Para mandársela a un cliente desde su pedido, abrí el pedido y tocá «Adjuntar PDF como respuesta».</p>
      </div>
    );

  return (
    <div className="space-y-6" data-tour="quote-quick-form">
      {initial ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm">
          <span className="font-semibold">Editando {initial.number}</span>
          <span className="text-muted-foreground">
            {initial.status === "ISSUED"
              ? initial.pdfOutdated
                ? "Tiene cambios que el PDF todavía no tiene: generalo de nuevo."
                : "PDF generado. Si cambiás algo, generalo de nuevo."
              : "Borrador."}
          </span>
          <ButtonLink variant="ghost" size="sm" href={`/admin/quotes/${initial.id}?paso=1`} className="ml-auto">
            Pasar al editor completo (textos, fotos, ambientes)
          </ButtonLink>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <ClientSelectWithCreate clients={clients} owners={owners} priceLists={priceLists} value={clientId} onChange={setClientId} placeholder="Buscá un cliente activo…" />
          {!clientId ? (
            <div>
              <Label htmlFor="qq-client">o escribí el cliente (sin darlo de alta)</Label>
              <Input id="qq-client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ej. Hotel Alvear" />
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor="qq-contact">Contacto</Label>
          <Input id="qq-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="qq-ref">Nombre del proyecto (opcional)</Label>
          <Input id="qq-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. Audio del salón principal" />
        </div>
      </div>
      {!clientId && !clientName.trim() ? <p className="text-sm text-warning">Podés guardarla igual; para generar el PDF elegí un cliente o escribí su nombre.</p> : null}

      <div className="space-y-3">
        <ProductSearchPicker
          label="Buscar productos"
          search={search}
          showPrice
          onPick={(item) => {
            const product = found.current.get(item.id);
            if (product) add(product);
          }}
        />
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Pegar una lista de códigos</summary>
          <div className="mt-2 space-y-2">
            <Label htmlFor="qq-bulk">Un producto por línea: código y cantidad (ej. «PPX8 2»)</Label>
            <Textarea id="qq-bulk" value={bulk} onChange={(e) => setBulk(e.target.value)} rows={4} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !bulk.trim()}
              onClick={() =>
                start(async () => {
                  const r = await resolveQuickQuoteSkus(bulk, clientId || null);
                  r.items.forEach((p) => add(p, p.quantity));
                  setErrors(r.missing.length ? ["No encontramos: " + r.missing.join(", ")] : []);
                  if (r.items.length) setBulk("");
                })
              }
            >
              Agregar a la lista
            </Button>
          </div>
        </details>
        <Button type="button" variant="outline" size="sm" onClick={addFree}>
          <Plus className="h-4 w-4" /> Agregar ítem libre (algo que no está en el catálogo)
        </Button>
      </div>

      <QuickQuoteItems items={items} onChange={setItems} taxMode={taxMode} defaultIva={defaultIva} />

      <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="qq-type">Tipo de documento</Label>
          <Select id="qq-type" value={profileKey} onChange={(e) => setProfileKey(e.target.value)}>
            {documentTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">Qué secciones lleva el PDF. Los tipos propios se crean en Configuración → Cotizaciones.</p>
        </div>
        <div>
          <Label htmlFor="qq-aud">A quién va</Label>
          <Select id="qq-aud" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="auto">Automático (según el cliente o el tipo)</option>
            <option value="">Ninguno (textos generales)</option>
            {audiences.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">Elige la versión de los textos del PDF para ese rubro.</p>
        </div>
        <div>
          <Label htmlFor="qq-tax">Impuestos</Label>
          <Select id="qq-tax" value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
            {TAX_MODES.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{TAX_MODES.find((mode) => mode.key === taxMode)?.hint}</p>
        </div>
        <div>
          <Label htmlFor="qq-validity">Vigencia de la oferta (días)</Label>
          <Input id="qq-validity" type="number" min="1" value={validity} onChange={(e) => setValidity(Number(e.target.value))} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <input type="checkbox" checked={showPhotos} onChange={(e) => setShowPhotos(e.target.checked)} />
          Mostrar las fotos de los productos en el PDF
        </label>
      </div>

      {errors.length ? (
        <ul className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={pending || !items.length} onClick={() => save(false)}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editing ? "Guardar cambios" : "Guardar"}
        </Button>
        {canIssue ? (
          <Button disabled={pending || !items.length || (!clientId && !clientName.trim())} onClick={() => save(true)}>
            {editing && initial?.status === "ISSUED" ? "Guardar y volver a generar el PDF" : "Guardar y generar el PDF"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
