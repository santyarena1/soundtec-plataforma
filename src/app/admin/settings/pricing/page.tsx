import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { SettingField, SettingsCard } from "@/components/admin/setting-field";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Admin · Precios y moneda" };

const KEYS = ["app.global_margin_percent", "pricing.tc_venta", "pricing.coef_nac_global"];

export default async function SettingsPricingPage() {
  await requirePermission("settings.manage");
  const rows = await prisma.adminSetting.findMany({ where: { key: { in: KEYS } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/pricing" />

      <SettingsCard
        title="Valores base de cálculo"
        description="Se aplican cuando no hay una regla más específica para el producto o el cliente."
      >
        <SettingField
          settingKey="app.global_margin_percent"
          label="Margen global (%)"
          hint="Margen de venta por defecto sobre el costo."
          value={map.get("app.global_margin_percent") || ""}
          placeholder="35"
        />
        <SettingField
          settingKey="pricing.coef_nac_global"
          label="Coeficiente de nacionalización (FOB → NAC)"
          hint="Multiplicador que convierte el costo FOB en costo nacionalizado."
          value={map.get("pricing.coef_nac_global") || ""}
          placeholder="3.5"
        />
      </SettingsCard>

      <SettingsCard title="Tipo de cambio" description="Referencia para expresar precios en pesos.">
        <SettingField
          settingKey="pricing.tc_venta"
          label="Tipo de cambio venta (ARS/USD)"
          hint="Se usa en cotizaciones y en el portal cuando el precio se muestra en pesos."
          value={map.get("pricing.tc_venta") || ""}
          placeholder="1200.50"
        />
      </SettingsCard>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-semibold">Reglas por cliente, marca o producto</p>
        <p className="muted-text mt-0.5">
          Estos valores son el punto de partida. Las excepciones con prioridad se administran por separado.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href="/admin/margins" variant="outline" size="sm">
            Márgenes
          </ButtonLink>
          <ButtonLink href="/admin/discounts" variant="outline" size="sm">
            Descuentos
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
