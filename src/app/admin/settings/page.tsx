import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { SETTINGS_GROUPS } from "@/lib/settings-sections";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Admin · Configuración" };

export default async function AdminSettingsHubPage() {
  const { permissions } = await getCurrentPermissions();
  const groups = SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => permissionsHave(permissions, i.scope)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8" data-tour="settings-hub">
      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {group.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="group block">
                <Card className="h-full transition-colors group-hover:border-primary/40">
                  <CardContent className="flex h-full items-start gap-3 p-5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-medium">
                        {item.label}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </p>
                      <p className="muted-text mt-1">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
