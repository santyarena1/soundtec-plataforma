"use client";

import { TAX_MODES } from "@/lib/quote-totals";
import { useEffect, useState, useTransition } from "react";
import { ClientSelectWithCreate } from "@/components/admin/client-select-with-create";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { QuickQuoteItems, type QuickItem, type TaxMode } from "./quick-quote-items";
import {
  createQuickQuote,
  resolveQuickQuoteSkus,
  searchQuickQuoteProducts,
} from "@/server/actions/quick-quote";
import { attachQuoteAsRequestResponse } from "@/server/actions/requests";
import { formatUsd } from "@/lib/utils";

type Product = Awaited<ReturnType<typeof searchQuickQuoteProducts>>[number];

let uidSeq = 0;
const newUid = () => `l${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

export function QuickQuoteForm({
  clients,
  owners,
  priceLists,
  validityDays,
  requests,
  canIssue,
  defaultIva,
}: {
  clients: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  priceLists: { id: string; name: string }[];
  validityDays: number;
  requests: { id: string; clientId: string | null; label: string }[];
  /** Puede emitir el PDF oficial (permiso «Emitir»). */
  canIssue: boolean;
  defaultIva: number;
}) {
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [contact, setContact] = useState("");
  const [reference, setReference] = useState(
    `Cotización rápida ${new Date().toLocaleDateString("es-AR")}`,
  );
  const [layoutKey, setLayoutKey] = useState("COMPACT");
  const [taxMode, setTaxMode] = useState<TaxMode>("NOTE");
  const [validity, setValidity] = useState(validityDays);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<QuickItem[]>([]);
  const [bulk, setBulk] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<{
    quoteId: string;
    number: string;
    pdfUrl?: string;
  } | null>(null);
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length < 2) return setResults([]);
      searchQuickQuoteProducts(query, clientId || null).then(setResults);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, clientId]);
  // Al cambiar el cliente, se recalculan los precios de lista con sus condiciones.
  useEffect(() => {
    if (!items.length) return;
    const lines = items.filter((item) => !item.included);
    Promise.all(lines.map((item) => searchQuickQuoteProducts(item.sku || item.name, clientId || null))).then((sets) => {
      const priceByUid = new Map(lines.map((item, i) => [item.uid, sets[i]?.find((p) => p.id === item.productId)?.price]));
      setItems((old) => old.map((item) => (item.included ? item : { ...item, unitPriceUsd: priceByUid.get(item.uid) ?? item.unitPriceUsd })));
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
        note: "Incluido con " + (product.sku || product.name),
        included: true,
        ivaPercent: a.ivaPercent,
        parentUid: uid,
        perParent: a.quantity,
      }));
    setItems((old) => [...old, line, ...included]);
    setQuery("");
    setResults([]);
  }

  function create(issue: boolean) {
    setErrors([]);
    start(async () => {
      const result = await createQuickQuote({
        clientId: clientId || null,
        clientName: clientId ? "" : clientName,
        contactName: contact,
        reference,
        layoutKey: layoutKey as "COMPACT",
        taxMode,
        validityDays: validity,
        issue,
        items,
      });
      if (!result.ok) setErrors(result.errors || ["No se pudo crear la cotización."]);
      else if (!issue) window.location.href = `/admin/quotes/${result.quoteId}?paso=4`;
      else setSuccess({ quoteId: result.quoteId!, number: result.number!, pdfUrl: result.pdfUrl });
    });
  }

  if (success)
    return (
      <div className="space-y-4 rounded-lg border border-success/30 bg-success/5 p-6">
        <h2 className="text-xl font-semibold">Cotización {success.number} emitida</h2>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            href={success.pdfUrl || `/admin/quotes/${success.quoteId}/print`}
            target="_blank"
          >
            Abrir PDF
          </ButtonLink>
          <ButtonLink
            variant="outline"
            href={`mailto:?subject=${encodeURIComponent(success.number)}&body=${encodeURIComponent(success.pdfUrl || window.location.origin + "/admin/quotes/" + success.quoteId)}`}
          >
            Enviar al cliente por email
          </ButtonLink>
        </div>
        <div className="flex max-w-lg gap-2">
          <Select value={requestId} onChange={(e) => setRequestId(e.target.value)}>
            <option value="">Adjuntar a un pedido abierto…</option>
            {requests
              .filter((r) => r.clientId === clientId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
          </Select>
          <Button
            variant="outline"
            disabled={!requestId || pending}
            onClick={() =>
              start(async () => {
                const r = await attachQuoteAsRequestResponse({
                  requestId,
                  quoteId: success.quoteId,
                });
                if (!r.ok) setErrors([r.error || "No se pudo adjuntar."]);
              })
            }
          >
            Adjuntar
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-6" data-tour="quote-quick-form">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <ClientSelectWithCreate
            clients={clients}
            owners={owners}
            priceLists={priceLists}
            value={clientId}
            onChange={setClientId}
            placeholder="Buscá un cliente activo…"
          />
          {!clientId ? (
            <div>
              <Label>o escribí el cliente (sin darlo de alta)</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ej. Hotel Alvear" />
            </div>
          ) : null}
        </div>
        <div>
          <Label>Contacto</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div>
          <Label required>Referencia</Label>
          <Input required value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      {!clientId && !clientName.trim() ? (
        <p className="text-sm text-warning">
          Podés guardar el borrador, pero para emitir elegí un cliente o escribí su nombre.
        </p>
      ) : null}
      <div className="relative">
        <Label>Buscar productos</Label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              add(results[0]);
            }
          }}
          placeholder="Nombre o SKU; Enter agrega el primero"
        />
        {results.length ? (
          <div className="absolute z-20 w-full rounded-md border bg-card shadow">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="flex w-full justify-between border-b p-2 text-left text-sm"
              >
                <span>
                  {p.name} · {p.sku || "Sin SKU"} · {p.brand}
                </span>
                <b>{formatUsd(p.price)}</b>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <Label>Pegar lista (SKU cantidad, una línea por producto)</Label>
        <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={4} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            start(async () => {
              const r = await resolveQuickQuoteSkus(bulk, clientId || null);
              r.items.forEach((p) => add(p, p.quantity));
              setErrors(r.missing.length ? ["No encontramos: " + r.missing.join(", ")] : []);
            })
          }
        >
          Agregar varios
        </Button>
      </div>
      <QuickQuoteItems items={items} onChange={setItems} taxMode={taxMode} defaultIva={defaultIva} />
      <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
        <div>
          <Label>Plantilla</Label>
          <Select value={layoutKey} onChange={(e) => setLayoutKey(e.target.value)}>
            <option value="COMPACT">Compacta · solo la tabla y las condiciones</option>
            <option value="STANDARD">Estándar · propuesta, marcas y condiciones</option>
            <option value="EDITORIAL">Editorial · el documento completo</option>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {layoutKey === "COMPACT"
              ? "Una carilla: encabezado, productos y condiciones comerciales."
              : layoutKey === "STANDARD"
                ? "Varias páginas, igual que una cotización común: nuestra propuesta, marcas, instalación y garantías."
                : "Todo el documento, con criterios de diseño, productos clave y funcionalidad."}
          </p>
        </div>
        <div>
          <Label>Impuestos</Label>
          <Select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "NOTE")}>
            {TAX_MODES.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {TAX_MODES.find((mode) => mode.key === taxMode)?.hint}
          </p>
        </div>
        <div>
          <Label>Validez (días)</Label>
          <Input
            type="number"
            min="1"
            value={validity}
            onChange={(e) => setValidity(Number(e.target.value))}
          />
        </div>
      </div>
      {errors.length ? (
        <ul className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending || !items.length} onClick={() => create(false)}>
          Guardar como borrador y abrir el editor
        </Button>
        {canIssue ? (
          <Button disabled={pending || !items.length || (!clientId && !clientName.trim())} onClick={() => create(true)}>
            Crear y emitir PDF
          </Button>
        ) : null}
      </div>
    </div>
  );
}
