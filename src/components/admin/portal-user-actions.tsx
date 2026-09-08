"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordReveal } from "@/components/admin/password-reveal";
import {
  createPortalUserForClient,
  resetPortalUserPassword,
  togglePortalUserActive,
} from "@/server/actions/clients";
export function CreatePortalAccess({
  clientId,
  name,
  email,
}: {
  clientId: string;
  name: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState<string>(),
    [pwd, setPwd] = useState<string>(),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" disabled={!email} onClick={() => setOpen(true)}>
        Crear usuario del portal
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Crear acceso al portal" size="sm">
        {pwd ? (
          <PasswordReveal password={pwd} />
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createPortalUserForClient(new FormData(e.currentTarget));
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setPwd(r.password);
                router.refresh();
              });
            }}
          >
            <input type="hidden" name="clientId" value={clientId} />
            <div>
              <Label>Nombre</Label>
              <Input name="name" defaultValue={name} />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={email || ""} />
            </div>
            <div>
              <Label>Contraseña (opcional)</Label>
              <Input name="password" type="password" placeholder="Generar automáticamente" />
            </div>
            <FieldError message={error} />
            <Button className="w-full" type="submit" disabled={pending}>
              Crear acceso
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
export function PortalUserActions({
  id,
  clientId,
  isActive,
}: {
  id: string;
  clientId: string;
  isActive: boolean;
}) {
  const [pwd, setPwd] = useState<string>(),
    [error, setError] = useState<string>(),
    [pending, start] = useTransition();
  const router = useRouter();
  function data() {
    const f = new FormData();
    f.set("id", id);
    f.set("clientId", clientId);
    return f;
  }
  return (
    <>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await togglePortalUserActive(data());
              if (!r.ok) setError(r.error);
              router.refresh();
            })
          }
        >
          {isActive ? "Desactivar" : "Activar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resetPortalUserPassword(data());
              if (!r.ok) setError(r.error);
              else setPwd(r.password);
            })
          }
        >
          Resetear clave
        </Button>
      </div>
      {error ? <FieldError message={error} /> : null}
      <Modal
        open={Boolean(pwd)}
        onClose={() => setPwd(undefined)}
        title="Nueva contraseña temporal"
        size="sm"
      >
        {pwd ? <PasswordReveal password={pwd} /> : null}
      </Modal>
    </>
  );
}
