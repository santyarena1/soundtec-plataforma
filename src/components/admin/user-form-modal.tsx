"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, Select } from "@/components/ui/input";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { AccessModePicker, AccessReveal } from "@/components/admin/access-reveal";
import { createUser, updateUser } from "@/server/actions/users";
import type { AccessMode, AccessResult } from "@/server/user-access";

type Role = "CLIENT" | "STAFF" | "ADMIN" | "SUPER_ADMIN";

export type UserFormData = {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  customRoleId: string | null;
  phone: string | null;
  quoteSignName?: string | null;
  quoteSignTitle?: string | null;
};

export type RoleOption = { id: string; name: string; description: string | null; forPortal: boolean };

/** Equipo interno o acceso de un cliente al portal: son cosas distintas y se crean distinto. */
type Kind = "staff" | "portal";

const kindOf = (role: Role): Kind => (role === "CLIENT" ? "portal" : "staff");

export function UserFormModal({
  clients,
  roles,
  isSuper,
  isAdmin,
  user,
  kind: fixedKind,
  defaultClientId,
  triggerLabel,
  triggerVariant,
}: {
  clients: { id: string; name: string }[];
  roles: RoleOption[];
  /** Quien edita es super admin (puede crear super admins). */
  isSuper: boolean;
  /** Quien edita es admin (puede crear administradores). */
  isAdmin: boolean;
  user?: UserFormData;
  /** Abrir directo en "equipo" o "portal" (botones separados del listado). */
  kind?: Kind;
  defaultClientId?: string;
  triggerLabel?: string;
  triggerVariant?: "primary" | "outline";
}) {
  const initialKind: Kind = user ? kindOf(user.role) : fixedKind ?? "staff";
  const staffRoles = roles.filter((r) => !r.forPortal);
  const portalRoles = roles.filter((r) => r.forPortal);
  const defaultStaffRole = staffRoles.find((r) => r.name.toLowerCase() === "vendedor")?.id ?? staffRoles[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [role, setRole] = useState<Role>(user?.role ?? (initialKind === "portal" ? "CLIENT" : "STAFF"));
  const [clientId, setClientId] = useState(user?.clientId ?? defaultClientId ?? "");
  const [customRole, setCustomRole] = useState(user?.customRoleId ?? (initialKind === "staff" ? defaultStaffRole : ""));
  const [accessMode, setAccessMode] = useState<AccessMode>("invite");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ access: AccessResult; email: string; name: string }>();
  const [pending, start] = useTransition();
  const router = useRouter();

  function switchKind(next: Kind) {
    setKind(next);
    setRole(next === "portal" ? "CLIENT" : "STAFF");
    setCustomRole(next === "staff" ? defaultStaffRole : "");
  }

  function close() {
    setOpen(false);
    setResult(undefined);
    setError(undefined);
    if (result) router.refresh();
  }

  const label = triggerLabel ?? (user ? "Editar usuario" : fixedKind === "portal" ? "Nuevo acceso de cliente" : fixedKind === "staff" ? "Nuevo usuario del equipo" : "Nuevo usuario");

  return (
    <>
      <Button variant={triggerVariant ?? (user ? "outline" : "primary")} onClick={() => setOpen(true)} data-tour="users-new-btn">
        {label}
      </Button>
      <Modal open={open} onClose={close} title={user ? "Editar usuario" : kind === "portal" ? "Nuevo acceso al portal" : "Nuevo usuario del equipo"} size="lg">
        {result ? (
          <div className="space-y-4">
            <AccessReveal access={result.access} email={result.email} name={result.name} />
            <Button onClick={close}>Listo</Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              start(async () => {
                const f = new FormData(form);
                f.set("role", role);
                f.set("clientId", kind === "portal" ? clientId : "");
                f.set("customRoleId", role === "STAFF" || role === "CLIENT" ? customRole : "");
                f.set("accessMode", accessMode);
                const r = user ? await updateUser(f) : await createUser(f);
                if (!r.ok) return setError(r.error);
                if (r.access) {
                  setResult({ access: r.access, email: String(f.get("email") ?? ""), name: String(f.get("name") ?? "") });
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {user ? <input type="hidden" name="id" value={user.id} /> : null}

            {!user && !fixedKind ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <KindCard active={kind === "staff"} onClick={() => switchKind("staff")} icon={<ShieldCheck className="h-4 w-4" />} title="Equipo interno" help="Vendedores, administración, carga de catálogo. Entran al panel." />
                <KindCard active={kind === "portal"} onClick={() => switchKind("portal")} icon={<Building2 className="h-4 w-4" />} title="Cliente (portal)" help="Una persona de una empresa cliente. Ve el catálogo con sus precios y hace pedidos." />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label required>Nombre y apellido</Label>
                <Input name="name" defaultValue={user?.name} required autoComplete="off" />
              </div>
              <div>
                {/* autoComplete="off" + name distinto de "username": el navegador no lo toma como formulario de login. */}
                <Label required>Email</Label>
                <Input name="email" type="email" defaultValue={user?.email} required autoComplete="off" data-1p-ignore data-lpignore="true" />
              </div>
              <div>
                <Label>Teléfono / WhatsApp</Label>
                <Input name="phone" defaultValue={user?.phone ?? ""} autoComplete="off" />
              </div>
            </div>

            {kind === "staff" ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Acceso al panel</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  <RoleCard active={role === "STAFF"} onClick={() => setRole("STAFF")} title="Según su rol" help="Ve y hace solo lo que permite el rol." />
                  {isAdmin ? <RoleCard active={role === "ADMIN"} onClick={() => setRole("ADMIN")} title="Administrador" help="Acceso total, con costos y márgenes." /> : null}
                  {isSuper ? <RoleCard active={role === "SUPER_ADMIN"} onClick={() => setRole("SUPER_ADMIN")} title="Super admin" help="Total, incluye administrar admins." /> : null}
                </div>
                {role === "STAFF" ? (
                  <div>
                    <Label required>Rol</Label>
                    <Select value={customRole} onChange={(e) => setCustomRole(e.target.value)} required>
                      <option value="">Elegí un rol…</option>
                      {staffRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {staffRoles.find((r) => r.id === customRole)?.description ?? "Los permisos de cada rol se editan en "}
                      {" "}
                      <Link href="/admin/settings/roles" className="text-primary hover:underline">
                        Configuración → Roles
                      </Link>
                      .
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Nombre en la firma de cotizaciones</Label>
                    <Input name="quoteSignName" defaultValue={user?.quoteSignName ?? ""} placeholder="Si se deja vacío, va el nombre" />
                  </div>
                  <div>
                    <Label>Cargo en la firma</Label>
                    <Input name="quoteSignTitle" defaultValue={user?.quoteSignTitle ?? ""} placeholder="Ej. Ejecutivo comercial" />
                  </div>
                </div>
              </fieldset>
            ) : (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Empresa</legend>
                <SearchablePick label="Cliente (empresa)" options={clients} value={clientId} onChange={setClientId} required />
                <p className="text-xs text-muted-foreground">
                  ¿La empresa todavía no existe?{" "}
                  <Link href="/admin/clients?nuevo=1" className="text-primary hover:underline">
                    Creala en Clientes
                  </Link>{" "}
                  (ahí también cargás contactos, condiciones y descuentos, y le das acceso a cada contacto).
                </p>
                {portalRoles.length ? (
                  <div>
                    <Label>Permisos en el portal</Label>
                    <Select value={customRole} onChange={(e) => setCustomRole(e.target.value)}>
                      <option value="">Estándar (catálogo, carrito y pedidos)</option>
                      {portalRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </fieldset>
            )}

            {!user ? <AccessModePicker value={accessMode} onChange={setAccessMode} /> : null}

            <FieldError message={error} />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : user ? "Guardar cambios" : kind === "portal" ? "Crear acceso" : "Crear usuario"}
              </Button>
              {user ? <p className="text-xs text-muted-foreground">Si cambiás el tipo, el rol o el email, se cierran sus sesiones abiertas.</p> : null}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function KindCard({ active, onClick, icon, title, help }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; help: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border p-3 text-left text-sm transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-secondary/50"}`}>
      <span className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
    </button>
  );
}

function RoleCard({ active, onClick, title, help }: { active: boolean; onClick: () => void; title: string; help: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border p-3 text-left text-sm transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-secondary/50"}`}>
      <span className="flex items-center gap-1.5 font-medium">
        <Users className="h-3.5 w-3.5" />
        {title}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
    </button>
  );
}
