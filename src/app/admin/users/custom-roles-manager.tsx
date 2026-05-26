"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  PERMISSION_GROUPS,
  type PermissionScope,
  type Permissions,
  PRESET_CATALOG_EMPLOYEE,
  PRESET_COMMERCIAL_SENIOR,
} from "@/lib/permissions";
import { upsertCustomRoleVisual, toggleCustomRoleActive } from "@/server/actions/user-role-management";

interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  baseSystemRole: "SUPER_ADMIN" | "ADMIN" | "CLIENT";
  permissions: Permissions;
  isActive: boolean;
}

interface Props {
  isSuper: boolean;
  roles: RoleSummary[];
}

const baseRoleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  CLIENT: "Cliente",
};

export function CustomRolesManager({ isSuper, roles }: Props) {
  return (
    <div className="space-y-4">
      <CreateRoleCard isSuper={isSuper} />

      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay roles personalizados creados.</p>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <RoleEditor key={r.id} role={r} isSuper={isSuper} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateRoleCard({ isSuper }: { isSuper: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseRole, setBaseRole] = useState<"CLIENT" | "ADMIN" | "SUPER_ADMIN">("CLIENT");
  const [permissions, setPermissions] = useState<Permissions>({ scopes: [], hidePrices: false });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function toggleScope(scope: PermissionScope) {
    setPermissions((prev) => {
      const has = prev.scopes.includes(scope);
      return { ...prev, scopes: has ? prev.scopes.filter((s) => s !== scope) : [...prev.scopes, scope] };
    });
  }

  function applyPreset(preset: Permissions) {
    setPermissions(preset);
  }

  function submit() {
    setError(null);
    setOk(null);
    if (!name.trim()) {
      setError("El nombre del rol es obligatorio.");
      return;
    }
    start(async () => {
      try {
        await upsertCustomRoleVisual({
          name: name.trim(),
          description: description.trim() || null,
          baseSystemRole: baseRole,
          permissions,
          isActive: true,
        });
        setOk("Rol creado correctamente.");
        setName("");
        setDescription("");
        setPermissions({ scopes: [], hidePrices: false });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear el rol.");
      }
    });
  }

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <h3 className="text-sm font-semibold">Crear rol personalizado</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Marcá visualmente qué pantallas y acciones puede usar este rol. Sin JSON, sin código.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label required>Nombre del rol</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Empleado catálogo" />
        </div>
        <div>
          <Label>Rol base del sistema</Label>
          <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value as typeof baseRole)}>
            <option value="CLIENT">Cliente (login de portal)</option>
            <option value="ADMIN">Administrador (entra al admin)</option>
            {isSuper ? <option value="SUPER_ADMIN">Super administrador</option> : null}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Descripción</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="¿Qué hace este rol?"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground">Plantillas rápidas:</span>
        <button
          type="button"
          onClick={() => applyPreset(PRESET_CATALOG_EMPLOYEE)}
          className="rounded border border-border bg-card px-2 py-1 hover:bg-secondary"
        >
          Empleado de catálogo (sin precios)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(PRESET_COMMERCIAL_SENIOR)}
          className="rounded border border-border bg-card px-2 py-1 hover:bg-secondary"
        >
          Comercial senior
        </button>
        <button
          type="button"
          onClick={() => applyPreset({ scopes: [] })}
          className="rounded border border-border bg-card px-2 py-1 hover:bg-secondary"
        >
          Limpiar
        </button>
      </div>

      <PermissionsMatrix permissions={permissions} onToggleScope={toggleScope} onChange={setPermissions} />

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {ok ? <p className="mt-2 text-sm text-success">{ok}</p> : null}

      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Crear rol
        </Button>
      </div>
    </div>
  );
}

function RoleEditor({ role, isSuper }: { role: RoleSummary; isSuper: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description || "");
  const [baseRole, setBaseRole] = useState<"CLIENT" | "ADMIN" | "SUPER_ADMIN">(role.baseSystemRole);
  const [permissions, setPermissions] = useState<Permissions>(role.permissions);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function toggleScope(scope: PermissionScope) {
    setPermissions((prev) => {
      const has = prev.scopes.includes(scope);
      return { ...prev, scopes: has ? prev.scopes.filter((s) => s !== scope) : [...prev.scopes, scope] };
    });
  }

  function save() {
    setError(null);
    setOk(null);
    start(async () => {
      try {
        await upsertCustomRoleVisual({
          id: role.id,
          name: name.trim(),
          description: description.trim() || null,
          baseSystemRole: baseRole,
          permissions,
          isActive: role.isActive,
        });
        setOk("Cambios guardados.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  function toggleActive() {
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("id", role.id);
        await toggleCustomRoleActive(fd);
        router.refresh();
      } catch {
        setError("No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen((s) => !s)} className="flex-1 text-left">
          <p className="text-sm font-semibold">{role.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {role.description || "Sin descripción"} · Base: {baseRoleLabel[role.baseSystemRole]} ·{" "}
            {role.permissions.fullAccess
              ? "acceso total"
              : `${role.permissions.scopes.length} permiso(s)`}
            {role.permissions.hidePrices ? " · sin precios" : ""}
          </p>
        </button>
        <div className="flex items-center gap-2">
          {role.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
          <Button onClick={toggleActive} variant="ghost" size="sm" disabled={pending}>
            {role.isActive ? "Desactivar" : "Activar"}
          </Button>
          <Button onClick={() => setOpen((s) => !s)} variant="outline" size="sm">
            {open ? "Cerrar" : "Editar"}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Rol base</Label>
              <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value as typeof baseRole)}>
                <option value="CLIENT">Cliente</option>
                <option value="ADMIN">Administrador</option>
                {isSuper ? <option value="SUPER_ADMIN">Super administrador</option> : null}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Descripción</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <PermissionsMatrix permissions={permissions} onToggleScope={toggleScope} onChange={setPermissions} />

          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          {ok ? <p className="mt-2 text-sm text-success">{ok}</p> : null}

          <div className="mt-3 flex justify-end">
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PermissionsMatrix({
  permissions,
  onToggleScope,
  onChange,
}: {
  permissions: Permissions;
  onToggleScope: (scope: PermissionScope) => void;
  onChange: (next: Permissions) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={permissions.fullAccess || false}
            onChange={(e) => onChange({ ...permissions, fullAccess: e.target.checked })}
          />
          Acceso total (sin restricciones)
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={permissions.hidePrices || false}
            onChange={(e) => onChange({ ...permissions, hidePrices: e.target.checked })}
          />
          Ocultar TODO precio en la UI
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.title} className="rounded-md border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            <div className="space-y-1.5">
              {group.items.map((it) => {
                const checked = permissions.fullAccess || permissions.scopes.includes(it.scope);
                return (
                  <label key={it.scope} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={permissions.fullAccess}
                      onChange={() => onToggleScope(it.scope)}
                      className="mt-0.5"
                    />
                    <span>
                      {it.label}
                      {it.help ? (
                        <span className="block text-[11px] text-muted-foreground">{it.help}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
