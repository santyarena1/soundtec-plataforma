"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Building2,
  Eye,
  FileSpreadsheet,
  Globe2,
  Hammer,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Package,
  Palette,
  Percent,
  Receipt,
  Share2,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Truck,
  Users,
  ChevronRight,
} from "lucide-react";
import type { PermissionScope } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  scope?: PermissionScope;
};
type NavGroup = { title: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    title: "Operación",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, scope: "dashboard" },
      { href: "/admin/requests", label: "Solicitudes", icon: ListChecks, scope: "requests.view" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/admin/products", label: "Productos", icon: Package, scope: "products.view" },
      { href: "/admin/brands", label: "Marcas", icon: Tags, scope: "brands.manage" },
      { href: "/admin/distributors", label: "Distribuidores", icon: Truck, scope: "distributors.manage" },
      { href: "/admin/categories", label: "Categorías", icon: Building2, scope: "categories.manage" },
      { href: "/admin/families", label: "Familias", icon: Building2, scope: "families.manage" },
    ],
  },
  {
    title: "Listas e importación",
    items: [
      { href: "/admin/imports", label: "Importaciones Excel", icon: FileSpreadsheet, scope: "imports.manage" },
      { href: "/admin/share-lists", label: "Listas compartibles", icon: Share2, scope: "share_lists.manage" },
      { href: "/admin/mappings", label: "Mapeos", icon: ListChecks, scope: "imports.manage" },
      { href: "/admin/scrapers", label: "Scrapers", icon: Hammer, scope: "scrapers.manage" },
    ],
  },
  {
    title: "Precios y visibilidad",
    items: [
      { href: "/admin/margins", label: "Márgenes", icon: Percent, scope: "margins.manage" },
      { href: "/admin/discounts", label: "Descuentos", icon: Receipt, scope: "discounts.manage" },
      { href: "/admin/visibility", label: "Visibilidad por cliente", icon: Eye, scope: "visibility.manage" },
    ],
  },
  {
    title: "Cuentas",
    items: [
      { href: "/admin/clients", label: "Clientes", icon: Users, scope: "clients.view" },
      { href: "/admin/users", label: "Usuarios", icon: ShieldCheck, scope: "users.view" },
    ],
  },
  {
    title: "Contenido",
    items: [
      { href: "/admin/landing", label: "Landing pública", icon: Globe2, scope: "landing.manage" },
      { href: "/admin/ai", label: "IA y feedback", icon: Sparkles, scope: "ai.manage" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/admin/settings", label: "Configuración", icon: Settings2, scope: "settings.manage" },
      { href: "/admin/branding", label: "Branding", icon: Palette, scope: "branding.manage" },
      { href: "/admin/api-keys", label: "API Keys", icon: ShieldCheck, scope: "api_keys.manage" },
      { href: "/admin/tickets", label: "Tickets al dev", icon: LifeBuoy, scope: "tickets.manage" },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface Props {
  /** Scopes habilitados del usuario actual. */
  allowedScopes: PermissionScope[];
  /** Si es full access (super admin) ignora allowedScopes. */
  fullAccess?: boolean;
}

export function AdminSidebarNav({ allowedScopes, fullAccess }: Props) {
  const pathname = usePathname();

  const allowSet = useMemo(() => new Set(allowedScopes), [allowedScopes]);
  const canSee = (scope?: PermissionScope) => {
    if (fullAccess) return true;
    if (!scope) return true;
    return allowSet.has(scope);
  };

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.scope)) }))
      .filter((g) => g.items.length > 0);
  }, [allowSet, fullAccess]);

  const activeByGroup = useMemo(() => {
    return Object.fromEntries(
      filteredGroups.map((g) => [g.title, g.items.some((i) => isActive(pathname, i))])
    ) as Record<string, boolean>;
  }, [pathname, filteredGroups]);

  // Todo colapsado por defecto; el usuario abre el grupo que necesite.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(filteredGroups.map((g) => [g.title, false]))
  );

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {filteredGroups.map((group) => {
        const opened = open[group.title] ?? false;
        const groupActive = activeByGroup[group.title];
        return (
          <div key={group.title} className="">
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [group.title]: !opened }))}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-secondary/50 ${
                groupActive ? "text-foreground" : "text-muted-foreground/80"
              }`}
            >
              <span>{group.title}</span>
              <ChevronRight
                className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 ${opened ? "rotate-90" : ""}`}
              />
            </button>
            {opened ? (
              <div className="mb-2 ml-1 space-y-0.5 border-l border-border/80 pl-2.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                        active
                          ? "bg-primary/8 font-medium text-primary"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      }`}
                    >
                      <item.icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : ""}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
