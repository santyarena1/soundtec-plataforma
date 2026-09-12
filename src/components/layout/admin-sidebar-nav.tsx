"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ONBOARDING_ACTIVE_EVENT,
  ONBOARDING_INACTIVE_EVENT,
} from "@/lib/onboarding/events";
import {
  BookOpen,
  Building2,
  Eye,
  FileSpreadsheet,
  Globe2,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  Package,
  Percent,
  Receipt,
  Share2,
  Settings2,
  ShieldCheck,
  Tags,
  Truck,
  Users,
  ChevronRight,
  PackageSearch,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import type { PermissionScope } from "@/lib/permissions";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  scope?: PermissionScope;
  /** Visible si el usuario tiene al menos uno de estos scopes. */
  anyScope?: PermissionScope[];
  /** data-tour para el paseo de bienvenida. */
  tourId?: string;
};
type NavGroup = { title: string; items: NavItem[]; tourId?: string };

const groups: NavGroup[] = [
  {
    title: "Operación",
    tourId: "nav-operacion",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, scope: "dashboard", tourId: "nav-link-dashboard" },
      { href: "/admin/requests", label: "Pedidos", icon: ListChecks, scope: "requests.view", tourId: "nav-link-requests" },
      { href: "/admin/quotes", label: "Cotizaciones", icon: FileSpreadsheet, scope: "quotes.view_own", tourId: "nav-link-quotes" },
      { href: "/admin/feedback", label: "Feedback de IA", icon: MessageSquare, scope: "ai.manage" },
    ],
  },
  {
    title: "Catálogo",
    tourId: "nav-catalogo",
    items: [
      { href: "/admin/products", label: "Productos", icon: Package, scope: "products.view", tourId: "nav-link-products" },
      { href: "/admin/brands", label: "Marcas", icon: Tags, scope: "brands.manage", tourId: "nav-link-brands" },
      { href: "/admin/labels", label: "Etiquetas", icon: Tags, scope: "brands.manage" },
      { href: "/admin/distributors", label: "Proveedores", icon: Truck, scope: "distributors.manage" },
      { href: "/admin/categories", label: "Categorías", icon: Building2, scope: "categories.manage" },
      { href: "/admin/families", label: "Familias", icon: Building2, scope: "families.manage" },
      { href: "/admin/ncm", label: "Posiciones NCM", icon: PackageSearch, scope: "imports.manage" },
    ],
  },
  {
    title: "Listas e importación",
    items: [
      { href: "/admin/sync", label: "Sincronización", icon: RefreshCw, scope: "imports.manage" },
      { href: "/admin/imports", label: "Importar Excel", icon: FileSpreadsheet, scope: "imports.manage" },
    ],
  },
  {
    title: "Precios y visibilidad",
    tourId: "nav-precios",
    items: [
      { href: "/admin/margins", label: "Márgenes", icon: Percent, scope: "margins.manage", tourId: "nav-link-margins" },
      { href: "/admin/discounts", label: "Descuentos", icon: Receipt, scope: "discounts.manage", tourId: "nav-link-discounts" },
      { href: "/admin/visibility", label: "Visibilidad por cliente", icon: Eye, scope: "visibility.manage", tourId: "nav-link-visibility" },
      { href: "/admin/share-lists", label: "Listas compartibles", icon: Share2, scope: "share_lists.manage", tourId: "nav-link-share-lists" },
    ],
  },
  {
    title: "CRM",
    tourId: "nav-crm",
    items: [
      { href: "/admin/clients", label: "Clientes", icon: Users, scope: "clients.view", tourId: "nav-link-clients" },
      { href: "/admin/users", label: "Usuarios", icon: ShieldCheck, scope: "users.view", tourId: "nav-link-users" },
    ],
  },
  {
    title: "Sitio y sistema",
    items: [
      { href: "/admin/landing", label: "Landing pública", icon: Globe2, scope: "landing.manage" },
      {
        href: "/admin/settings",
        label: "Configuración",
        icon: Settings2,
        anyScope: SETTINGS_SECTIONS.map((s) => s.scope),
      },
      { href: "/admin/ayuda", label: "Ayuda y tutorial", icon: BookOpen },
      { href: "/admin/changelog", label: "Changelog", icon: ScrollText },
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
  /** En el drawer mobile conviene ver todos los grupos abiertos. */
  expandAll?: boolean;
}

export function AdminSidebarNav({ allowedScopes, fullAccess, expandAll }: Props) {
  const pathname = usePathname();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    function onActive() {
      setOnboardingOpen(true);
    }
    function onInactive() {
      setOnboardingOpen(false);
    }
    window.addEventListener(ONBOARDING_ACTIVE_EVENT, onActive);
    window.addEventListener(ONBOARDING_INACTIVE_EVENT, onInactive);
    return () => {
      window.removeEventListener(ONBOARDING_ACTIVE_EVENT, onActive);
      window.removeEventListener(ONBOARDING_INACTIVE_EVENT, onInactive);
    };
  }, []);

  const allowSet = useMemo(() => new Set(allowedScopes), [allowedScopes]);

  const filteredGroups = useMemo(() => {
    const canSee = (item: NavItem) => {
      if (fullAccess) return true;
      if (item.anyScope) return item.anyScope.some((s) => allowSet.has(s));
      if (!item.scope) return true;
      return allowSet.has(item.scope);
    };
    return groups
      .map((g) => ({ ...g, items: g.items.filter(canSee) }))
      .filter((g) => g.items.length > 0);
  }, [allowSet, fullAccess]);

  const activeGroupTitle = useMemo(
    () => filteredGroups.find((g) => g.items.some((i) => isActive(pathname, i)))?.title,
    [pathname, filteredGroups]
  );

  // Sólo se guardan los grupos que el usuario abrió o cerró a mano;
  // el resto sigue al grupo activo, así la sección donde estás nunca aparece colapsada.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" data-tour="nav-sidebar">
      {filteredGroups.map((group) => {
        const groupActive = group.title === activeGroupTitle;
        const opened = overrides[group.title] ?? (expandAll || onboardingOpen || groupActive);
        return (
          <div key={group.title} data-tour={group.tourId}>
            <button
              type="button"
              aria-expanded={opened}
              onClick={() => setOverrides((s) => ({ ...s, [group.title]: !opened }))}
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
                      data-tour={item.tourId}
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
