"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Input, Label, FieldError } from "@/components/ui/input";
import { AccessModePicker, AccessReveal } from "@/components/admin/access-reveal";
import { createPortalUserForClient, resetPortalUserPassword, togglePortalUserActive } from "@/server/actions/clients";
import type { AccessMode, AccessResult } from "@/server/user-access";

/** Darle acceso al portal a un contacto de la empresa. */
export function CreatePortalAccess({ clientId, name, email, phone }: { clientId: string; name: string; email: string | null; phone?: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<AccessMode>("invite");
  const [result, setResult] = useState<{ access: AccessResult; email: string; name: string }>();
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" disabled={!email} title={email ? "" : "Cargale un email al contacto primero"} onClick={() => setOpen(true)}>
        Dar acceso al portal
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setResult(undefined);
        }}
        title="Acceso al portal"
        size="md"
      >
        {result ? (
          <AccessReveal access={result.access} email={result.email} name={result.name} />
        ) : (
          <form
            className="space-y-3"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              start(async () => {
                const f = new FormData(form);
                f.set("accessMode", mode);
                const r = await createPortalUserForClient(f);
                if (!r.ok || !r.access) return setError(r.error);
                setResult({ access: r.access, email: String(f.get("email") ?? ""), name: String(f.get("name") ?? "") });
                router.refresh();
              });
            }}
          >
            <input type="hidden" name="clientId" value={clientId} />
            {phone ? <input type="hidden" name="phone" value={phone} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nombre</Label>
                <Input name="name" defaultValue={name} autoComplete="off" />
              </div>
              <div>
                <Label>Email (será su usuario)</Label>
                <Input name="email" type="email" defaultValue={email ?? ""} autoComplete="off" data-1p-ignore data-lpignore="true" />
              </div>
            </div>
            <AccessModePicker value={mode} onChange={setMode} />
            <FieldError message={error} />
            <Button className="w-full" type="submit" disabled={pending}>
              {pending ? "Creando…" : "Dar acceso"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Acciones sobre un usuario del portal de la empresa: nuevo acceso y activar/desactivar. */
export function PortalUserActions({ id, clientId, isActive, email, name }: { id: string; clientId: string; isActive: boolean; email: string; name: string }) {
  const [error, setError] = useState<string>();
  const [resetOpen, setResetOpen] = useState(false);
  const [mode, setMode] = useState<AccessMode>("invite");
  const [access, setAccess] = useState<AccessResult>();
  const [pending, start] = useTransition();
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
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setResetOpen(true)}>
          Nuevo acceso
        </Button>
      </div>
      {error ? <FieldError message={error} /> : null}
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setAccess(undefined);
        }}
        title="Nuevo acceso al portal"
        size="md"
      >
        {access ? (
          <AccessReveal access={access} email={email} name={name} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Su clave actual deja de servir y se cierran sus sesiones.</p>
            <AccessModePicker value={mode} onChange={setMode} />
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const f = data();
                  f.set("accessMode", mode);
                  const r = await resetPortalUserPassword(f);
                  if (r.ok && r.access) setAccess(r.access);
                  else setError(r.error);
                })
              }
            >
              {pending ? "Generando…" : mode === "invite" ? "Mandar invitación" : "Generar clave temporal"}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
