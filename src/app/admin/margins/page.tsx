import { requireStaff } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { PriceLogicHint } from "@/components/admin/price-logic-hint";
import { PriceReviewBanner } from "@/components/admin/price-review-banner";
import { PricingRulesWorkspace } from "../_rules/workspace";
import { loadRulesPageData } from "@/server/pricing/rules-page-data";

export const metadata = { title: "Admin · Márgenes" };

export default async function AdminMarginsPage() {
  await requireStaff("margins.manage", { costs: true });
  try {
    const data = await loadRulesPageData("margin");
    return (
      <div className="space-y-6">
        <PageHeader
          title="Márgenes"
          description="Definí el markup o el margen sobre el costo nacionalizado. La regla más específica gana. Cada regla queda con fecha de alta y se puede editar."
        />

        <PriceReviewBanner area="MARGIN" counts={data.pendingCounts} />

        <PriceLogicHint variant="margin" />

        <PricingRulesWorkspace
          kind="margin"
          rows={data.rows}
          pending={data.pending}
          renderedAt={data.renderedAt}
          empty="Todavía no hay reglas de precio."
          clients={data.clients}
          brands={data.brands}
          distributors={data.distributors}
          families={data.families}
          lines={data.lines}
          products={data.products}
        />
      </div>
    );
  } catch (err) {
    console.error("AdminMarginsPage", err);
    return (
      <div className="space-y-4">
        <PageHeader
          title="Márgenes"
          description="Definí el markup o el margen sobre el costo nacionalizado. La regla más específica gana."
        />
        <p className="text-sm text-destructive">
          No se pudieron cargar las reglas. Recargá la página. Si acabás de guardar, la regla puede
          estar igual: volvé a entrar a Márgenes.
        </p>
      </div>
    );
  }
}
