"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_GROUPS } from "@/lib/settings-sections";

interface Props {
  allowedHrefs: string[];
}

export function SettingsNav({ allowedHrefs }: Props) {
  const pathname = usePathname();
  const allowed = new Set(allowedHrefs);

  const groups = SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.has(i.href)),
  })).filter((g) => g.items.length > 0);

  const flat = [{ href: "/admin/settings", label: "Todas" }, ...groups.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label })))];

  return (
    <nav aria-label="Secciones de configuración">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 lg:hidden">
        {flat.map((item) => {
          const active = item.href === "/admin/settings" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="hidden space-y-5 lg:block">
        <Link
          href="/admin/settings"
          className={`flex items-center rounded-md px-2.5 py-2 text-sm transition-colors ${
            pathname === "/admin/settings"
              ? "bg-primary/8 font-medium text-primary"
              : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          }`}
        >
          Todas las secciones
        </Link>

        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary/8 font-medium text-primary"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
