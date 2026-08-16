"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Heart, LayoutDashboard, Package, Send } from "lucide-react";

const items = [
  { href: "/portal", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/portal/products", label: "Catálogo", icon: Package },
  { href: "/portal/wishlist", label: "Favoritos", icon: Heart },
  { href: "/portal/lists", label: "Listas", icon: Bookmark },
  { href: "/portal/requests", label: "Pedidos", icon: Send },
];

export function PortalBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      aria-label="Navegación del portal"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
