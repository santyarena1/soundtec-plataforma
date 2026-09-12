"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient, updateClient } from "@/server/actions/clients";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldError, FieldHint, Textarea } from "@/components/ui/input";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { PasswordReveal } from "@/components/admin/password-reveal";
type ClientData = {
  id: string;
  companyName: string;
  tradeName?: string | null;
  taxId?: string | null;
  segment?: string | null;
  ownerId?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  source?: string | null;
  notes?: string | null;
  assignedPriceListId?: string | null;
  tags?: string[];
  isActive?: boolean;
};
export function ClientFormModal({
  owners,
  priceLists,
  client,
  triggerLabel = "Nuevo cliente",
  onCreated,
}: {
  owners: { id: string; name: string }[];
  priceLists: { id: string; name: string }[];
  client?: ClientData;
  triggerLabel?: string;
  onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(1),
    [error, setError] = useState<string>(),
    [pwd, setPwd] = useState<string>(),
    [createdId, setCreatedId] = useState<string>(),
    [owner, setOwner] = useState(client?.ownerId || ""),
    [pending, start] = useTransition();
  const router = useRouter();
  function submit(form: HTMLFormElement) {
    start(async () => {
      const data = new FormData(form);
      data.set("ownerId", owner);
      const result = client ? await updateClient(data) : await createClient(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.password) {
        setCreatedId(result.id);
        setPwd(result.password);
        // El cliente ya existe: avisar igual (ej. para seleccionarlo en la cotización).
        if (onCreated && result.id) onCreated(result.id);
        return;
      }
      setOpen(false);
      if (result.id) {
        if (onCreated) {
          // Quien abre el modal decide qué hacer (ej. seleccionar el cliente en una cotización).
          onCreated(result.id);
          return;
        }
        router.push(`/admin/clients/${result.id}`);
      }
      router.refresh();
    });
  }
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-tour="clients-new-btn">
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={client ? "Editar empresa" : "Nuevo cliente"}
        description={client ? "Actualizá los datos comerciales." : `Paso ${step} de 2`}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
          className="space-y-4"
        >
          {client ? <input type="hidden" name="id" value={client.id} /> : null}
          {pwd ? (
            <>
              <PasswordReveal password={pwd} />
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onCreated) return;
                  router.push(`/admin/clients/${client?.id || createdId || ""}`);
                }}
              >
                {onCreated ? "Listo" : "Ir a la ficha"}
              </Button>
            </>
          ) : (
            <>
            <div className={step === 1 ? "space-y-4" : "hidden"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label required>Razón social</Label>
                  <Input name="companyName" defaultValue={client?.companyName} required />
                </div>
                <div>
                  <Label>Nombre de fantasía</Label>
                  <Input name="tradeName" defaultValue={client?.tradeName || ""} />
                </div>
                <div>
                  <Label>CUIT</Label>
                  <Input name="taxId" defaultValue={client?.taxId || ""} />
                </div>
                <div>
                  <Label>Segmento</Label>
                  <Select name="segment" defaultValue={client?.segment || ""}>
                    <option value="">Sin definir</option>
                    {[
                      "Integrador",
                      "Corporativo",
                      "Educación",
                      "Residencial",
                      "Gobierno",
                      "Rental",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </div>
                <SearchablePick
                  label="Responsable"
                  options={owners}
                  value={owner}
                  onChange={setOwner}
                />
              </div>
              {client ? <CompanyExtra client={client} priceLists={priceLists} /> : null}
              <div className="flex justify-end">
                <Button
                  type={client ? "submit" : "button"}
                  onClick={(e) => {
                    if (client) return;
                    const form = e.currentTarget.closest("form");
                    const company = form?.querySelector<HTMLInputElement>('input[name="companyName"]');
                    if (company && !company.value.trim()) {
                      company.reportValidity();
                      return;
                    }
                    setStep(2);
                  }}
                  disabled={pending}
                >
                  {client ? "Guardar cambios" : "Continuar"}
                </Button>
              </div>
            </div>
            <div className={step === 2 && !client ? "space-y-4" : "hidden"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Nombre del contacto</Label>
                  <Input name="contactName" />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input name="contactRole" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="contactEmail" type="email" />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input name="contactPhone" />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input name="contactWhatsapp" />
                </div>
              </div>
              <label className="flex gap-2 text-sm">
                <input type="checkbox" name="createPortalUser" />
                Crear también un usuario del portal para este contacto
              </label>
              <div>
                <Label>Contraseña inicial (opcional)</Label>
                <Input
                  name="password"
                  type="password"
                  placeholder="Vacío para generar automáticamente"
                />
                <FieldHint>Si la dejás vacía, te mostraremos una temporal una sola vez.</FieldHint>
              </div>
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Volver
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Guardando…" : "Crear cliente"}
                </Button>
              </div>
            </div>
            </>
          )}
          <FieldError message={error} />
        </form>
      </Modal>
    </>
  );
}
function CompanyExtra({
  client,
  priceLists,
}: {
  client: ClientData;
  priceLists: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>Lista de precios de referencia</Label>
        <Select name="assignedPriceListId" defaultValue={client.assignedPriceListId || ""}>
          <option value="">Predeterminada</option>
          {priceLists.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <FieldHint>El precio real sale de las reglas comerciales.</FieldHint>
      </div>
      <div>
        <Label>Origen</Label>
        <Input name="source" defaultValue={client.source || ""} />
      </div>
      <div>
        <Label>Sitio web</Label>
        <Input name="website" defaultValue={client.website || ""} />
      </div>
      <div>
        <Label>Etiquetas</Label>
        <Input name="tags" defaultValue={client.tags?.join(", ")} />
      </div>
      <div className="sm:col-span-2">
        <Label>Dirección</Label>
        <Input name="address" defaultValue={client.address || ""} />
      </div>
      <Input name="city" defaultValue={client.city || ""} placeholder="Ciudad" />
      <Input name="province" defaultValue={client.province || ""} placeholder="Provincia" />
      <input type="hidden" name="country" value={client.country || "Argentina"} />
      <div className="sm:col-span-2">
        <Label>Notas internas</Label>
        <Textarea name="notes" defaultValue={client.notes || ""} />
      </div>
      <input type="hidden" name="isActive" value={String(client.isActive !== false)} />
    </div>
  );
}
