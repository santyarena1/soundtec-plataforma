"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea, FieldHint } from "@/components/ui/input";
import { AccessModePicker, AccessReveal } from "@/components/admin/access-reveal";
import { CLIENT_SEGMENTS, PROVINCES, TAX_CONDITIONS } from "@/lib/clients/fields";
import { createClientFull, updateClientFull, type CreatedAccess } from "@/server/actions/clients";
import type { AccessMode } from "@/server/user-access";

type Option = { id: string; name: string };

type Discount = { target: "ALL" | "BRAND" | "CATEGORY"; targetId: string | null; percent: string };

type Contact = {
  key: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  whatsapp: string;
  notes: string;
  isPrimary: boolean;
  portalAccess: boolean;
};

export type ClientEditorInitial = {
  id: string;
  companyName: string;
  tradeName: string | null;
  taxId: string | null;
  taxCondition: string | null;
  segment: string | null;
  source: string | null;
  website: string | null;
  ownerId: string | null;
  tags: string[];
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  paymentTerms: string | null;
  creditLimitUsd: number | null;
  assignedPriceListId: string | null;
  discounts: Array<{ target: "ALL" | "BRAND" | "CATEGORY"; targetId: string | null; percent: number }>;
};

let keySeq = 0;
const newContact = (primary = false): Contact => ({
  key: `c${++keySeq}`,
  name: "",
  role: "",
  email: "",
  phone: "",
  whatsapp: "",
  notes: "",
  isPrimary: primary,
  portalAccess: false,
});

/**
 * Alta y edición completa de un cliente: empresa, dirección, contactos (con
 * acceso al portal), condiciones comerciales y descuentos, todo de una vez.
 * En edición los contactos y accesos se manejan desde la ficha.
 */
export function ClientEditor({
  initial,
  owners,
  priceLists,
  brands,
  categories,
  canCommercial,
  canPortal,
  canChooseOwner,
  currentUserId,
}: {
  initial?: ClientEditorInitial;
  owners: Option[];
  priceLists: Option[];
  brands: Option[];
  categories: Option[];
  canCommercial: boolean;
  canPortal: boolean;
  canChooseOwner: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; accesses: CreatedAccess[] } | null>(null);

  const [company, setCompany] = useState({
    companyName: initial?.companyName ?? "",
    tradeName: initial?.tradeName ?? "",
    taxId: initial?.taxId ?? "",
    taxCondition: initial?.taxCondition ?? "",
    segment: initial?.segment ?? "",
    source: initial?.source ?? "",
    website: initial?.website ?? "",
    ownerId: initial?.ownerId ?? currentUserId,
    tags: (initial?.tags ?? []).join(", "),
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    province: initial?.province ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "Argentina",
    notes: initial?.notes ?? "",
  });
  const [commercial, setCommercial] = useState({
    paymentTerms: initial?.paymentTerms ?? "",
    creditLimitUsd: initial?.creditLimitUsd != null ? String(initial.creditLimitUsd) : "",
    assignedPriceListId: initial?.assignedPriceListId ?? "",
  });
  const [discounts, setDiscounts] = useState<Discount[]>(
    (initial?.discounts ?? []).map((d) => ({ target: d.target, targetId: d.targetId, percent: String(d.percent) }))
  );
  const [contacts, setContacts] = useState<Contact[]>(editing ? [] : [newContact(true)]);
  const [accessMode, setAccessMode] = useState<AccessMode>("invite");

  const setC = (patch: Partial<typeof company>) => setCompany((c) => ({ ...c, ...patch }));
  const setContact = (key: string, patch: Partial<Contact>) =>
    setContacts((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : patch.isPrimary ? { ...c, isPrimary: false } : c)));
  const anyAccess = contacts.some((c) => c.portalAccess);

  function payloadCompany() {
    return {
      ...company,
      tags: company.tags.split(",").map((t) => t.trim()).filter(Boolean),
      ownerId: company.ownerId || null,
    };
  }
  function payloadCommercial() {
    const limit = commercial.creditLimitUsd.trim() ? Number(commercial.creditLimitUsd.replace(",", ".")) : null;
    return {
      paymentTerms: commercial.paymentTerms || null,
      creditLimitUsd: limit != null && Number.isFinite(limit) ? limit : null,
      assignedPriceListId: commercial.assignedPriceListId || null,
      discounts: discounts
        .filter((d) => d.percent.trim())
        .map((d) => ({ target: d.target, targetId: d.target === "ALL" ? null : d.targetId, percent: Number(d.percent.replace(",", ".")) })),
    };
  }

  function submit() {
    setError(null);
    start(async () => {
      if (editing && initial) {
        const r = await updateClientFull({ id: initial.id, company: payloadCompany(), commercial: canCommercial ? payloadCommercial() : undefined });
        if (!r.ok) return setError(r.error);
        router.push(`/admin/clients/${initial.id}`);
        router.refresh();
        return;
      }
      const r = await createClientFull({
        company: payloadCompany(),
        commercial: canCommercial ? payloadCommercial() : undefined,
        contacts: contacts
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name, role: c.role || null, email: c.email || null, phone: c.phone || null, whatsapp: c.whatsapp || null, notes: c.notes || null, isPrimary: c.isPrimary, portalAccess: c.portalAccess })),
        accessMode,
      });
      if (!r.ok) return setError(r.error);
      if (r.accesses.length) return setCreated({ id: r.id, accesses: r.accesses });
      router.push(`/admin/clients/${r.id}`);
    });
  }

  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-lg font-semibold">Cliente creado</p>
          <p className="text-sm text-muted-foreground">Estos son los accesos al portal. Se muestran una sola vez.</p>
          {created.accesses.map((a) => (
            <div key={a.email}>
              <p className="mb-1 text-sm font-medium">{a.name}</p>
              <AccessReveal access={a.access} email={a.email} name={a.name} />
            </div>
          ))}
          <Button onClick={() => router.push(`/admin/clients/${created.id}`)}>Ir a la ficha del cliente</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      className="space-y-5"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Section title="Empresa" help="Datos fiscales y comerciales. Solo la razón social es obligatoria.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <Label required>Razón social</Label>
            <Input value={company.companyName} onChange={(e) => setC({ companyName: e.target.value })} required autoComplete="off" />
          </div>
          <div>
            <Label>Nombre de fantasía</Label>
            <Input value={company.tradeName} onChange={(e) => setC({ tradeName: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <Label>CUIT</Label>
            <Input value={company.taxId} onChange={(e) => setC({ taxId: e.target.value })} placeholder="30-12345678-9" inputMode="numeric" autoComplete="off" />
          </div>
          <div>
            <Label>Condición frente al IVA</Label>
            <Select value={company.taxCondition} onChange={(e) => setC({ taxCondition: e.target.value })}>
              <option value="">Sin definir</option>
              {TAX_CONDITIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Rubro</Label>
            <Select value={company.segment} onChange={(e) => setC({ segment: e.target.value })}>
              <option value="">Sin definir</option>
              {CLIENT_SEGMENTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
              {company.segment && !(CLIENT_SEGMENTS as readonly string[]).includes(company.segment) ? <option>{company.segment}</option> : null}
            </Select>
          </div>
          <div>
            <Label>Responsable comercial</Label>
            <Select value={company.ownerId} onChange={(e) => setC({ ownerId: e.target.value })} disabled={!canChooseOwner}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            {!canChooseOwner ? <FieldHint>Queda a tu cargo.</FieldHint> : null}
          </div>
          <div>
            <Label>Cómo llegó</Label>
            <Input value={company.source} onChange={(e) => setC({ source: e.target.value })} placeholder="Ej. recomendación, expo, web" />
          </div>
          <div>
            <Label>Sitio web</Label>
            <Input value={company.website} onChange={(e) => setC({ website: e.target.value })} placeholder="https://" />
          </div>
          <div>
            <Label>Etiquetas</Label>
            <Input value={company.tags} onChange={(e) => setC({ tags: e.target.value })} placeholder="Separadas por coma" />
          </div>
        </div>
      </Section>

      <Section title="Dirección">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Calle y número</Label>
            <Input value={company.address} onChange={(e) => setC({ address: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <Label>Ciudad / localidad</Label>
            <Input value={company.city} onChange={(e) => setC({ city: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <Label>Código postal</Label>
            <Input value={company.postalCode} onChange={(e) => setC({ postalCode: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <Label>Provincia</Label>
            <Select value={company.province} onChange={(e) => setC({ province: e.target.value })}>
              <option value="">Sin definir</option>
              {PROVINCES.map((p) => (
                <option key={p}>{p}</option>
              ))}
              {company.province && !(PROVINCES as readonly string[]).includes(company.province) ? <option>{company.province}</option> : null}
            </Select>
          </div>
          <div>
            <Label>País</Label>
            <Input value={company.country} onChange={(e) => setC({ country: e.target.value })} />
          </div>
        </div>
      </Section>

      {!editing ? (
        <Section title="Contactos" help="Las personas de la empresa. A cada una le podés dar acceso al portal (necesita email).">
          <div className="space-y-3">
            {contacts.map((c) => (
              <div key={c.key} className={`rounded-lg border p-3 ${c.isPrimary ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="lg:col-span-2">
                    <Label>Nombre y apellido</Label>
                    <Input value={c.name} onChange={(e) => setContact(c.key, { name: e.target.value })} autoComplete="off" />
                  </div>
                  <div>
                    <Label>Cargo</Label>
                    <Input value={c.role} onChange={(e) => setContact(c.key, { role: e.target.value })} placeholder="Compras, técnico…" />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Email</Label>
                    <Input type="email" value={c.email} onChange={(e) => setContact(c.key, { email: e.target.value })} autoComplete="off" data-1p-ignore data-lpignore="true" />
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input value={c.phone} onChange={(e) => setContact(c.key, { phone: e.target.value })} inputMode="tel" autoComplete="off" />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input value={c.whatsapp} onChange={(e) => setContact(c.key, { whatsapp: e.target.value })} inputMode="tel" autoComplete="off" />
                  </div>
                  <div className="lg:col-span-3">
                    <Label>Notas</Label>
                    <Input value={c.notes} onChange={(e) => setContact(c.key, { notes: e.target.value })} placeholder="Horarios, preferencias…" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={c.isPrimary} onChange={() => setContact(c.key, { isPrimary: true })} />
                    <Star className="h-3.5 w-3.5" /> Contacto principal
                  </label>
                  {canPortal ? (
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={c.portalAccess} onChange={(e) => setContact(c.key, { portalAccess: e.target.checked })} />
                      Darle acceso al portal
                    </label>
                  ) : null}
                  {contacts.length > 1 ? (
                    <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={() => setContacts((l) => l.filter((x) => x.key !== c.key))}>
                      <Trash2 className="h-3.5 w-3.5" /> Quitar
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setContacts((l) => [...l, newContact(l.length === 0)])}>
              <Plus className="h-4 w-4" /> Agregar contacto
            </Button>
            {anyAccess ? <AccessModePicker value={accessMode} onChange={setAccessMode} /> : null}
          </div>
        </Section>
      ) : null}

      {canCommercial ? (
        <Section title="Condiciones comerciales" help="Descuentos sobre el precio de venta, forma de pago y crédito. Se aplican al instante en el portal y en las cotizaciones.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Forma y plazo de pago</Label>
              <Input value={commercial.paymentTerms} onChange={(e) => setCommercial((c) => ({ ...c, paymentTerms: e.target.value }))} placeholder="Ej. Transferencia a 30 días" />
            </div>
            <div>
              <Label>Límite de crédito (USD)</Label>
              <Input value={commercial.creditLimitUsd} onChange={(e) => setCommercial((c) => ({ ...c, creditLimitUsd: e.target.value }))} inputMode="decimal" placeholder="Sin límite" />
            </div>
            <div>
              <Label>Lista de referencia</Label>
              <Select value={commercial.assignedPriceListId} onChange={(e) => setCommercial((c) => ({ ...c, assignedPriceListId: e.target.value }))}>
                <option value="">Predeterminada</option>
                {priceLists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Descuentos</p>
            {discounts.length === 0 ? <p className="text-xs text-muted-foreground">Sin descuentos: ve el precio de venta general.</p> : null}
            {discounts.map((d, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="w-40">
                  <Select value={d.target} onChange={(e) => setDiscounts((l) => l.map((x, j) => (j === i ? { ...x, target: e.target.value as Discount["target"], targetId: null } : x)))}>
                    <option value="ALL">Todo el catálogo</option>
                    <option value="BRAND">Una marca</option>
                    <option value="CATEGORY">Una categoría</option>
                  </Select>
                </div>
                {d.target !== "ALL" ? (
                  <div className="min-w-[12rem] flex-1">
                    <Select value={d.targetId ?? ""} onChange={(e) => setDiscounts((l) => l.map((x, j) => (j === i ? { ...x, targetId: e.target.value || null } : x)))}>
                      <option value="">Elegí…</option>
                      {(d.target === "BRAND" ? brands : categories).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div className="flex w-28 items-center gap-1">
                  <Input value={d.percent} onChange={(e) => setDiscounts((l) => l.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} inputMode="decimal" placeholder="10" />
                  <span className="text-sm">%</span>
                </div>
                <button type="button" className="mb-2 text-muted-foreground hover:text-destructive" onClick={() => setDiscounts((l) => l.filter((_, j) => j !== i))} aria-label="Quitar descuento">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setDiscounts((l) => [...l, { target: l.some((x) => x.target === "ALL") ? "BRAND" : "ALL", targetId: null, percent: "" }])}>
              <Plus className="h-4 w-4" /> Agregar descuento
            </Button>
            <FieldHint>Un descuento por marca o categoría reemplaza al general para esos productos (no se suman).</FieldHint>
          </div>
        </Section>
      ) : null}

      <Section title="Notas internas" help="Solo las ve el equipo.">
        <Textarea value={company.notes} onChange={(e) => setC({ notes: e.target.value })} rows={3} />
      </Section>

      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear cliente"}
        </Button>
        <Link href={initial ? `/admin/clients/${initial.id}` : "/admin/clients"} className="text-sm text-muted-foreground hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
