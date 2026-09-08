"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/input";
import { upsertClientContact } from "@/server/actions/clients";
type Contact = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
  isPrimary: boolean;
};
export function ContactFormModal({ clientId, contact }: { clientId: string; contact?: Contact }) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState<string>(),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant={contact ? "ghost" : "outline"} onClick={() => setOpen(true)}>
        {contact ? "Editar" : "Agregar contacto"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={contact ? "Editar contacto" : "Nuevo contacto"}
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await upsertClientContact(new FormData(e.currentTarget));
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <input type="hidden" name="clientId" value={clientId} />
          {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
          <div>
            <Label required>Nombre</Label>
            <Input name="name" defaultValue={contact?.name} required />
          </div>
          <div>
            <Label>Cargo</Label>
            <Input name="role" defaultValue={contact?.role || ""} />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" defaultValue={contact?.email || ""} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input name="phone" defaultValue={contact?.phone || ""} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input name="whatsapp" defaultValue={contact?.whatsapp || ""} />
          </div>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input type="checkbox" name="isPrimary" defaultChecked={contact?.isPrimary} />
            Contacto principal
          </label>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea name="notes" defaultValue={contact?.notes || ""} />
          </div>
          <div className="sm:col-span-2">
            <FieldError message={error} />
            <Button className="mt-2 w-full" type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar contacto"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
