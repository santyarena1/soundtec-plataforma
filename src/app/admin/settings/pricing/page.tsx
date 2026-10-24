import { requirePermission } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { getExchangeRate } from "@/lib/exchange-rate";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { ButtonLink } from "@/components/ui/button";
import { PricingSettingsForm } from "./pricing-form";

export const metadata = { title: "Admin · Precios y moneda" };

export default async function SettingsPricingPage() {
  await requirePermission("settings.manage");
  const [defaultMarkup, tcSource, tcFallback, currentRate] = await Promise.all([
    getSetting("pricing.default_markup", "1.35"),
    getSetting("pricing.tc_source", "blue"),
    getSetting("pricing.tc", ""),
    getExchangeRate(),
  ]);

  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/pricing" />
      <PricingSettingsForm defaultMarkup={defaultMarkup.replace(".", ",")} tcSource={tcSource} tcFallback={tcFallback === "1" ? "" : tcFallback} currentRate={currentRate} />
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-semibold">Reglas por cliente, marca o producto</p>
        <p className="muted-text mt-0.5">
          Lo de arriba es solo el punto de partida. Los márgenes y descuentos por marca, categoría, producto o cliente se manejan en Márgenes y Descuentos (y
          los de un producto, también desde su ficha → Precio y costos).
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
