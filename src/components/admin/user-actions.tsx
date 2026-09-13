"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/input";
import { PasswordReveal } from "@/components/admin/password-reveal";
import { deleteUser, resetUserPassword, toggleUserActive } from "@/server/actions/users";
export function UserActions({
  id,
  isActive,
  canDelete,
}: {
  id: string;
  isActive: boolean;
  canDelete: boolean;
}) {
  const [pwd, setPwd] = useState<string>(),
    [error, setError] = useState<string>(),
    [pending, start] = useTransition();
  const router = useRouter();
  const data = () => {
    const f = new FormData();
    f.set("id", id);
    return f;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resetUserPassword(data());
              if (r.ok) setPwd(r.password);
              else setError(r.error);
            })
          }
        >
          Resetear contraseña
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
            onClick={() => {
              if (confirm("¿Eliminar este usuario? Esta acción no se puede deshacer."))
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
      <FieldError message={error} />
      <Modal
        open={Boolean(pwd)}
        onClose={() => setPwd(undefined)}
        title="Nueva contraseña temporal"
        size="sm"
      >
        {pwd ? <PasswordReveal password={pwd} /> : null}
      </Modal>
    </div>
  );
}
