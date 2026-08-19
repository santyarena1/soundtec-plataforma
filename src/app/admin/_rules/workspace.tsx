"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RulesForm } from "./rules-form";
import { PricingRulesTable, type PricingRuleRow } from "@/components/admin/pricing-rules-table";

type Named = { id: string; name: string };
type ClientOpt = { id: string; name: string; companyName?: string | null };

export function PricingRulesWorkspace({
  kind,
  rows,
  empty,
  deleteAction,
  clients,
  brands,
  distributors,
  categories,
  families,
  products,
  lockedClientId,
}: {
  kind: "margin" | "discount";
  rows: PricingRuleRow[];
  empty: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  clients: ClientOpt[];
  brands: Named[];
  distributors: Named[];
  categories: Named[];
  families: Named[];
  products: { id: string; normalizedName: string }[];
  lockedClientId?: string;
}) {
  const [editing, setEditing] = useState<PricingRuleRow | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">
            {editing
              ? kind === "margin"
                ? "Editar regla de precio"
                : "Editar descuento"
              : kind === "margin"
                ? "Nueva regla de precio"
                : "Nueva regla de descuento"}
          </h2>
          <RulesForm
            key={editing?.id ?? "new"}
            type={kind}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            lockedClientId={lockedClientId}
            clients={clients}
            brands={brands}
            distributors={distributors}
            categories={categories}
            families={families}
            products={products}
          />
        </CardContent>
      </Card>

      <PricingRulesTable
        kind={kind}
        rows={rows}
        empty={empty}
        deleteAction={deleteAction}
        editingId={editing?.id}
        onEdit={setEditing}
      />
    </div>
  );
}
