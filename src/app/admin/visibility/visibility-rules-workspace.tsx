"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VisibilityRuleForm } from "./visibility-rule-form";
import { VisibilityRulesTable, type VisibilityRuleRow } from "./visibility-rules-table";

type Named = { id: string; name: string };

export function VisibilityRulesWorkspace({
  rows,
  clients,
  brands,
  distributors,
  categories,
  families,
  products,
  defaultClientId,
  deleteAction,
  toggleAction,
}: {
  rows: VisibilityRuleRow[];
  clients: { id: string; name: string; companyName: string | null }[];
  brands: Named[];
  distributors: Named[];
  categories: Named[];
  families: Named[];
  products: Named[];
  defaultClientId?: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<VisibilityRuleRow | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">{editing ? "Editar regla de visibilidad" : "Nueva excepción"}</h2>
          <VisibilityRuleForm
            key={editing?.id ?? "new"}
            clients={clients}
            brands={brands}
            distributors={distributors}
            categories={categories}
            families={families}
            products={products}
            defaultClientId={defaultClientId}
            initial={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </CardContent>
      </Card>

      <VisibilityRulesTable
        rows={rows}
        deleteAction={deleteAction}
        toggleAction={toggleAction}
        editingId={editing?.id}
        onEdit={setEditing}
      />
    </div>
  );
}
