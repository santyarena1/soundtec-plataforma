"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PERMISSION_GROUPS,
  PRICE_ACCESS_OPTIONS,
  PRESET_CATALOG_EMPLOYEE,
  PRESET_COMMERCIAL_SENIOR,
  PRESET_SELLER,
  type PermissionScope,
  type PriceAccess,
} from "@/lib/permissions";
import { deleteCustomRole, duplicateCustomRole, toggleCustomRoleActive, upsertCustomRoleVisual } from "@/server/actions/user-role-management";
import { confirmDialog } from "@/components/ui/confirm-dialog";

type RoleType = "STAFF" | "CLIENT";

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  /** STAFF / CLIENT; "LEGACY_ADMIN" = rol viejo con base Administrador (no limita a nadie). */
  type: RoleType | "LEGACY_ADMIN";
  scopes: PermissionScope[];
  priceAccess: PriceAccess;
  isActive: boolean;
  users: number;
  systemKey: string | null;
}

type Draft = { name: string; description: string; type: RoleType; scopes: PermissionScope[]; priceAccess: PriceAccess };

const EMPTY: Draft = { name: "", description: "", type: "STAFF", scopes: ["dashboard"], priceAccess: "sale" };

const PRESETS: Array<{ label: string; scopes: PermissionScope[]; priceAccess: PriceAccess }> = [
  { label: "Vendedor", scopes: PRESET_SELLER.scopes, priceAccess: PRESET_SELLER.priceAccess ?? "sale" },
  { label: "Comercial senior", scopes: PRESET_COMMERCIAL_SENIOR.scopes, priceAccess: "full" },
  { label: "Carga de catálogo", scopes: PRESET_CATALOG_EMPLOYEE.scopes, priceAccess: "none" },
];

const priceLabel = (p: PriceAccess) => PRICE_ACCESS_OPTIONS.find((o) => o.value === p)?.label ?? p;

export function CustomRolesManager({ roles }: { roles: RoleSummary[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cada usuario del equipo tiene un rol: define qué pantallas y acciones usa y qué precios ve. Los administradores
          tienen acceso total y no llevan rol. Los cambios se aplican en el próximo clic de cada usuario.
          <span className="mt-1 block text-xs">
            Quedan siempre para administradores: importar listas y sincronizar proveedores, configuración del sistema,
            marca, integraciones e IA.
          </span>
        </p>
        {!creating ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo rol
          </Button>
        ) : null}
      </div>

      {creating ? <RoleForm initial={EMPTY} onDone={() => setCreating(false)} /> : null}

      {roles.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay roles.</p> : null}
      <div className="space-y-3">
        {roles.map((r) => (
          <RoleRow key={r.id} role={r} />
        ))}
      </div>
    </div>
  );
}

function RoleRow({ role }: { role: RoleSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo.");
      router.refresh();
    });
  const legacy = role.type === "LEGACY_ADMIN";
  return (
    <div className={`rounded-lg border bg-card ${role.isActive ? "border-border" : "border-dashed border-border opacity-75"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen((s) => !s)} className="min-w-0 flex-1 text-left">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {role.name}
            <Badge tone={role.type === "CLIENT" ? "muted" : "accent"}>{role.type === "CLIENT" ? "Portal de clientes" : legacy ? "Base administrador (heredado)" : "Equipo interno"}</Badge>
            {role.type === "STAFF" ? <Badge tone={role.priceAccess === "full" ? "warning" : "muted"}>{priceLabel(role.priceAccess)}</Badge> : null}
            {!role.isActive ? <Badge tone="muted">Desactivado</Badge> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {role.description || "Sin descripción"} · {role.scopes.length} permiso(s)
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/users?rol=${role.id}`} className="text-xs text-primary hover:underline">
            {role.users} usuario(s)
          </Link>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => duplicateCustomRole(role.id))} title="Duplicar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => toggleCustomRoleActive(role.id))}>
            {role.isActive ? "Desactivar" : "Activar"}
          </Button>
          {role.users === 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              title="Eliminar"
              onClick={async () => {
                if (await confirmDialog({ message: `¿Eliminar el rol «${role.name}»?`, tone: "danger", confirmLabel: "Eliminar" })) run(() => deleteCustomRole(role.id));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setOpen((s) => !s)}>
            {open ? "Cerrar" : "Editar"}
          </Button>
        </div>
      </div>
      {error ? <p className="px-4 pb-2 text-sm text-destructive">{error}</p> : null}
      {legacy && open ? (
        <p className="mx-4 mb-3 rounded-md bg-warning/10 p-3 text-xs">
          Este rol se creó con base «Administrador»: hoy no limita nada (los administradores ven todo). Guardalo como «Equipo
          interno» y pasá a sus usuarios a tipo Equipo para que los permisos se apliquen de verdad.
        </p>
      ) : null}
      {open ? (
        <div className="border-t border-border p-4">
          <RoleForm
            id={role.id}
            initial={{ name: role.name, description: role.description ?? "", type: role.type === "CLIENT" ? "CLIENT" : "STAFF", scopes: role.scopes, priceAccess: role.priceAccess }}
            isActive={role.isActive}
            onDone={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function RoleForm({ id, initial, isActive, onDone }: { id?: string; initial: Draft; isActive?: boolean; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (scope: PermissionScope, on: boolean) =>
    set({ scopes: on ? [...new Set([...draft.scopes, scope])] : draft.scopes.filter((s) => s !== scope) });
  const groups = PERMISSION_GROUPS.filter((g) => (draft.type === "CLIENT" ? g.portal : !g.portal));

  function save() {
    setError(null);
    start(async () => {
      const r = await upsertCustomRoleVisual({
        id,
        name: draft.name,
        description: draft.description || null,
        baseSystemRole: draft.type,
        permissions: { scopes: draft.scopes, priceAccess: draft.priceAccess },
        isActive: isActive ?? true,
      });
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label required>Nombre</Label>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Vendedor zona norte" />
        </div>
        <div>
          <Label>Para</Label>
          <div className="mt-1 flex gap-2">
            {(["STAFF", "CLIENT"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ type: t, scopes: t === "CLIENT" ? ["portal.catalog", "portal.requests", "portal.cart"] : ["dashboard"] })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${draft.type === t ? "border-primary bg-primary/5 font-medium" : "hover:bg-secondary/50"}`}
              >
                {t === "STAFF" ? "Equipo interno" : "Clientes del portal"}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Label>Descripción</Label>
          <Input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Qué hace quien tiene este rol" />
        </div>
      </div>

      {draft.type === "STAFF" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Partir de:</span>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => set({ scopes: p.scopes, priceAccess: p.priceAccess })} className="rounded border border-border bg-card px-2 py-1 hover:bg-secondary">
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => set({ scopes: [] })} className="rounded border border-border bg-card px-2 py-1 hover:bg-secondary">
              Nada
            </button>
          </div>

          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">Precios que ve</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRICE_ACCESS_OPTIONS.map((o) => (
                <label key={o.value} className={`cursor-pointer rounded-md border p-2.5 text-sm ${draft.priceAccess === o.value ? "border-primary bg-primary/5" : "hover:bg-secondary/40"}`}>
                  <input type="radio" className="mr-2" checked={draft.priceAccess === o.value} onChange={() => set({ priceAccess: o.value })} />
                  <span className="font-medium">{o.label}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{o.help}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const all = group.items.every((i) => draft.scopes.includes(i.scope));
          return (
            <div key={group.title} className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => set({ scopes: all ? draft.scopes.filter((s) => !group.items.some((i) => i.scope === s)) : [...new Set([...draft.scopes, ...group.items.map((i) => i.scope)])] })}
                >
                  {all ? "Quitar todo" : "Marcar todo"}
                </button>
              </div>
              <div className="space-y-1.5">
                {group.items.map((it) => {
                  const needsCosts = it.costs && draft.priceAccess !== "full";
                  return (
                    <label key={it.scope} className={`flex cursor-pointer items-start gap-2 text-sm ${needsCosts ? "opacity-60" : ""}`}>
                      <input type="checkbox" checked={draft.scopes.includes(it.scope)} onChange={(e) => toggle(it.scope, e.target.checked)} className="mt-0.5" />
                      <span>
                        {it.label}
                        {needsCosts ? <span className="block text-[11px] text-warning">Necesita «Todo: costos y márgenes» en precios.</span> : null}
                        {it.help ? <span className="block text-[11px] text-muted-foreground">{it.help}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {id ? "Guardar cambios" : "Crear rol"}
        </Button>
      </div>
    </div>
  );
}
