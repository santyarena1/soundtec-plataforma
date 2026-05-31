import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveSetting } from "@/server/actions/settings";

export const metadata = { title: "Admin · Configuración" };

const visibleKeys = [
  { key: "app.name", label: "Nombre del portal", placeholder: "Soundtec" },
  { key: "app.currency", label: "Moneda por defecto", placeholder: "USD" },
  { key: "app.global_margin_percent", label: "Margen global (%)", placeholder: "35" },
  { key: "pricing.tc_venta", label: "Tipo de cambio venta (ARS/USD)", placeholder: "Ej. 1200.50" },
  { key: "pricing.coef_nac_global", label: "Coeficiente NAC global (FOB→NAC)", placeholder: "Ej. 3.5" },
  { key: "visibility.default_show_all", label: "Mostrar todo por defecto (true/false)", placeholder: "true" },
];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const rows = await prisma.adminSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Parámetros globales del portal." />

      <div className="space-y-3">
        {visibleKeys.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-5">
              <form action={saveSetting} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <input type="hidden" name="key" value={s.key} />
                <div>
                  <Label htmlFor={s.key}>{s.label}</Label>
                  <p className="text-xs text-muted-foreground">{s.key}</p>
                  <Input id={s.key} name="value" defaultValue={map.get(s.key) || ""} placeholder={s.placeholder} />
                </div>
                <Button type="submit">Guardar</Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
