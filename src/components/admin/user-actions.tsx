"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/input";
import { AccessModePicker, AccessReveal } from "@/components/admin/access-reveal";
import { deleteUser, resetUserPassword, toggleUserActive } from "@/server/actions/users";
import type { AccessMode, AccessResult } from "@/server/user-access";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export function UserActions({
  id,
  email,
  name,
  isActive,
  canDelete,
  canManage,
}: {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  canDelete: boolean;
  /** Quien mira puede modificar a este usuario (jerarquía de tipos). */
  canManage: boolean;
}) {
  const [error, setError] = useState<string>();
  const [resetOpen, setResetOpen] = useState(false);
  const [mode, setMode] = useState<AccessMode>("invite");
  const [access, setAccess] = useState<AccessResult>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const data = () => {
    const f = new FormData();
    f.set("id", id);
    return f;
  };
  if (!canManage) return <p className="text-sm text-muted-foreground">Solo un super administrador puede modificar este usuario.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => setResetOpen(true)}>
          Nuevo acceso / resetear clave
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await toggleUserActive(data());
              if (!r.ok) setError(r.error);
              router.refresh();
            })
          }
        >
          {isActive ? "Desactivar" : "Activar"}
        </Button>
        {canDelete ? (
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              if (await confirmDialog({ message: "¿Eliminar este usuario? Esta acción no se puede deshacer.", tone: "danger", confirmLabel: "Eliminar" }))
                start(async () => {
                  const r = await deleteUser(data());
                  if (!r.ok) setError(r.error);
                  else router.push("/admin/users");
                });
            }}
          >
            Eliminar
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Desactivar o resetear la clave cierra al instante todas sus sesiones abiertas.</p>
      <FieldError message={error} />
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setAccess(undefined);
        }}
        title="Nuevo acceso"
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
                  const r = await resetUserPassword(f);
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
    </div>
  );
}
