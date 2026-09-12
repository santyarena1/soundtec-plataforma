"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { PasswordReveal } from "@/components/admin/password-reveal";
import { createUser, updateUser } from "@/server/actions/users";
type Data = {
  id: string;
  name: string;
  email: string;
  role: "CLIENT" | "ADMIN" | "SUPER_ADMIN";
  clientId: string | null;
  customRoleId: string | null;
  phone: string | null;
  quoteSignName?: string | null;
  quoteSignTitle?: string | null;
  isActive: boolean;
};
export function UserFormModal({
  clients,
  roles,
  isSuper,
  user,
  triggerLabel = "Nuevo usuario",
  onCreateClient,
}: {
  clients: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  isSuper: boolean;
  user?: Data;
  triggerLabel?: string;
  onCreateClient?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [role, setRole] = useState(user?.role || "CLIENT"),
    [clientId, setClientId] = useState(user?.clientId || ""),
    [customRole, setCustomRole] = useState(user?.customRoleId || ""),
    [mode, setMode] = useState("generate"),
    [error, setError] = useState<string>(),
    [pwd, setPwd] = useState<string>(),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant={user ? "outline" : "primary"} onClick={() => setOpen(true)} data-tour="users-new-btn">
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={user ? "Editar usuario" : "Nuevo usuario"}
        size="lg"
      >
        {pwd ? (
          <>
            <PasswordReveal password={pwd} />
            <Button
              className="mt-4"
              onClick={() => {
                setOpen(false);
                router.refresh();
              }}
            >
              Listo
            </Button>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const f = new FormData(e.currentTarget);
                f.set("role", role);
                f.set("clientId", clientId);
                f.set("customRoleId", customRole);
                f.set("passwordMode", mode);
                const r = user ? await updateUser(f) : await createUser(f);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                if (r.password) {
                  setPwd(r.password);
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {user ? <input type="hidden" name="id" value={user.id} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label required>Nombre</Label>
                <Input name="name" defaultValue={user?.name} required />
              </div>
              <div>
                <Label required>Email</Label>
                <Input name="email" type="email" defaultValue={user?.email} required />
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Tipo de usuario</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {[
                  ["CLIENT", "Cliente del portal", "Accede a precios y pedidos."],
                  ["ADMIN", "Administrador", "Gestiona la operación."],
                  ...(isSuper
                    ? [["SUPER_ADMIN", "Super admin", "Control total de la plataforma."]]
                    : []),
                ].map(([v, l, d]) => (
                  <label
                    key={v}
                    className={`rounded-lg border p-3 text-sm ${role === v ? "border-primary bg-primary/5" : ""}`}
                  >
                    <input
                      className="mr-2"
                      type="radio"
                      checked={role === v}
                      onChange={() => setRole(v as typeof role)}
                    />
                    <span className="font-medium">{l}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {role === "CLIENT" ? (
              <div>
                <SearchablePick
                  label="Cliente"
                  options={clients}
                  value={clientId}
                  onChange={setClientId}
                  required
                />
                <button
                  type="button"
                  className="mt-2 text-xs text-primary hover:underline"
                  onClick={onCreateClient}
                >
                  Crear cliente nuevo
                </button>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Teléfono</Label>
                <Input name="phone" defaultValue={user?.phone || ""} />
              </div>
              {user ? (
                <>
                  <div>
                    <Label>Firma para cotizaciones</Label>
                    <Input name="quoteSignName" defaultValue={user.quoteSignName || ""} />
                  </div>
                  <div>
                    <Label>Cargo en la firma</Label>
                    <Input name="quoteSignTitle" defaultValue={user.quoteSignTitle || ""} />
                  </div>
                </>
              ) : null}
            </div>
            {!user ? (
              <fieldset>
                <legend className="text-sm font-medium">Contraseña</legend>
                <label className="mr-4 text-sm">
                  <input
                    type="radio"
                    checked={mode === "generate"}
                    onChange={() => setMode("generate")}
                  />{" "}
                  Generar y mostrar
                </label>
                <label className="text-sm">
                  <input
                    type="radio"
                    checked={mode === "write"}
                    onChange={() => setMode("write")}
                  />{" "}
                  Escribir
                </label>
                {mode === "write" ? (
                  <Input className="mt-2" name="password" type="password" minLength={8} />
                ) : null}
              </fieldset>
            ) : null}
            <details>
              <summary className="cursor-pointer text-sm font-medium">Permisos avanzados</summary>
              <div className="mt-3">
                <SearchablePick
                  label="Rol personalizado"
                  options={roles}
                  value={customRole}
                  onChange={setCustomRole}
                />
              </div>
            </details>
            <input type="hidden" name="isActive" value={String(user?.isActive !== false)} />
            <FieldError message={error} />
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : user ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
