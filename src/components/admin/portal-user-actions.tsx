"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { UnsavedArea } from "@/components/unsaved-guard/unsaved-area";
import { DirtyReporter, useGuardedModalClose } from "@/components/admin/modal-unsaved";
import { Input, Label, FieldError } from "@/components/ui/input";
import { AccessModePicker, AccessReveal } from "@/components/admin/access-reveal";
import { createPortalUserForClient, resetPortalUserPassword, togglePortalUserActive } from "@/server/actions/clients";
import type { AccessMode, AccessResult } from "@/server/user-access";

/** Darle acceso al portal a un contacto de la empresa. */
export function CreatePortalAccess({
  clientId,
  name,
  email,
  phone,
  triggerLabel = "Dar acceso al portal",
  blank = false,
}: {
  clientId: string;
  name: string;
  email: string | null;
  phone?: string | null;
  triggerLabel?: string;
  /** Alta de una persona nueva (sin contacto cargado): los campos arrancan vacíos. */
  blank?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<AccessMode>("invite");
  const [result, setResult] = useState<{ access: AccessResult; email: string; name: string }>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const closeModal = useCallback(() => {
    setOpen(false);
    setResult(undefined);
  }, []);
  const { setDirty, requestClose } = useGuardedModalClose(closeModal);
  return (
    <>
      <Button size="sm" variant={blank ? "outline" : "ghost"} disabled={!blank && !email} title={blank || email ? "" : "Cargale un email al contacto primero"} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={requestClose}
        title={blank ? "Dar acceso a otra persona" : "Acceso al portal"}
        size="md"
      >
        {result ? (
          <AccessReveal access={result.access} email={result.email} name={result.name} />
        ) : (
          <UnsavedArea>
          <DirtyReporter onChange={setDirty} />
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
            {phone && !blank ? <input type="hidden" name="phone" value={phone} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label required>Nombre y apellido</Label>
                <Input name="name" defaultValue={name} autoComplete="off" required />
              </div>
              <div>
                <Label required>Email (con este entra)</Label>
                <Input name="email" type="email" defaultValue={email ?? ""} autoComplete="off" required data-1p-ignore data-lpignore="true" />
              </div>
            </div>
            <AccessModePicker value={mode} onChange={setMode} />
            <FieldError message={error} />
            <Button className="w-full" type="submit" disabled={pending}>
              {pending ? "Creando…" : "Dar acceso"}
            </Button>
          </form>
          </UnsavedArea>
        )}
      </Modal>
    </>
  );
}

/** Acciones sobre un usuario del portal de la empresa: reenviar invitación / restablecer acceso y activar/desactivar. */
export function PortalUserActions({
  id,
  clientId,
  isActive,
  email,
  name,
  invited = false,
}: {
  id: string;
  clientId: string;
  isActive: boolean;
  email: string;
  name: string;
  /** Todavía no creó su clave: la acción principal es reenviar la invitación. */
  invited?: boolean;
}) {
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
      <div className="flex flex-wrap gap-1">
        {isActive ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setResetOpen(true)}>
            {invited ? "Reenviar invitación" : "Restablecer acceso"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (isActive && !window.confirm(`${name} no va a poder entrar más al portal. ¿Seguimos?`)) return;
            start(async () => {
              const r = await togglePortalUserActive(data());
              if (!r.ok) setError(r.error);
              router.refresh();
            });
          }}
        >
          {isActive ? "Quitar acceso" : "Devolver acceso"}
        </Button>
      </div>
      {error ? <FieldError message={error} /> : null}
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          if (access) router.refresh();
          setAccess(undefined);
        }}
        title={invited ? "Reenviar invitación" : "Restablecer acceso"}
        size="md"
      >
        {access ? (
          <AccessReveal access={access} email={email} name={name} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {invited ? "El link anterior deja de servir. El nuevo vence en 72 horas." : "Su clave actual deja de servir y se cierran sus sesiones abiertas."}
            </p>
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
