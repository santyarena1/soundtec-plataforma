"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/server/actions/clients";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldError } from "@/components/ui/input";
import { AccessModePicker, AccessReveal } from "@/components/admin/access-reveal";
import { CLIENT_SEGMENTS, TAX_CONDITIONS } from "@/lib/clients/fields";
import type { AccessMode, AccessResult } from "@/server/user-access";

/**
 * Alta rápida de un cliente sin salir de donde estás (ej. al armar una
 * cotización): empresa, un contacto y, si querés, su acceso al portal. Para
 * cargarlo completo (dirección, varios contactos, condiciones y descuentos)
 * está la pantalla «Nuevo cliente».
 */
export function ClientFormModal({
  triggerLabel = "Nuevo cliente",
  onCreated,
}: {
  /** Compatibilidad: ya no se usan (el responsable es quien lo crea; se cambia en la ficha). */
  owners?: { id: string; name: string }[];
  priceLists?: { id: string; name: string }[];
  triggerLabel?: string;
  onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [withAccess, setWithAccess] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("invite");
  const [result, setResult] = useState<{ id: string; access?: AccessResult; email: string; name: string }>();
  const [pending, start] = useTransition();
  const router = useRouter();

  function done(id: string) {
    setOpen(false);
    setResult(undefined);
    if (onCreated) return onCreated(id);
    router.push(`/admin/clients/${id}`);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-tour="clients-new-btn">
        {triggerLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cliente (alta rápida)" size="lg">
        {result?.access ? (
          <div className="space-y-4">
            <AccessReveal access={result.access} email={result.email} name={result.name} />
            <Button onClick={() => done(result.id)}>{onCreated ? "Listo" : "Ir a la ficha"}</Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              start(async () => {
                const data = new FormData(form);
                data.set("createPortalUser", String(withAccess));
                data.set("accessMode", accessMode);
                const r = await createClient(data);
                if (!r.ok || !r.id) return setError(r.error);
                if (r.access) {
                  setResult({ id: r.id, access: r.access, email: String(data.get("contactEmail") ?? ""), name: String(data.get("contactName") ?? "") });
                  return;
                }
                done(r.id);
                router.refresh();
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label required>Razón social</Label>
                <Input name="companyName" required autoComplete="off" />
              </div>
              <div>
                <Label>Nombre de fantasía</Label>
                <Input name="tradeName" autoComplete="off" />
              </div>
              <div>
                <Label>CUIT</Label>
                <Input name="taxId" placeholder="30-12345678-9" inputMode="numeric" autoComplete="off" />
              </div>
              <div>
                <Label>Condición frente al IVA</Label>
                <Select name="taxCondition" defaultValue="">
                  <option value="">Sin definir</option>
                  {TAX_CONDITIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Rubro</Label>
                <Select name="segment" defaultValue="">
                  <option value="">Sin definir</option>
                  {CLIENT_SEGMENTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </div>
            </div>
            <fieldset className="space-y-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">Contacto principal</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Nombre y apellido</Label>
                  <Input name="contactName" autoComplete="off" />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input name="contactRole" autoComplete="off" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="contactEmail" type="email" autoComplete="off" data-1p-ignore data-lpignore="true" />
                </div>
                <div>
                  <Label>Teléfono / WhatsApp</Label>
                  <Input name="contactPhone" inputMode="tel" autoComplete="off" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={withAccess} onChange={(e) => setWithAccess(e.target.checked)} />
                Darle acceso al portal a este contacto
              </label>
              {withAccess ? <AccessModePicker value={accessMode} onChange={setAccessMode} /> : null}
            </fieldset>
            <FieldError message={error} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/admin/clients/nuevo" className="text-xs text-primary hover:underline">
                Cargar completo (dirección, varios contactos, condiciones y descuentos)
              </Link>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear cliente"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
