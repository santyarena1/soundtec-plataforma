"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_GROUPS } from "@/lib/settings-sections";

interface Props {
  /** Hrefs de las secciones que el usuario puede ver. */
  allowedHrefs: string[];
}

export function SettingsNav({ allowedHrefs }: Props) {
  const pathname = usePathname();
  const allowed = new Set(allowedHrefs);

  const groups = SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.has(i.href)),
  })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Secciones de configuración" className="space-y-5">
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
    </nav>
  );
}
