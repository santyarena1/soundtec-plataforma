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
  deleteGroupAction,
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
  deleteGroupAction: (formData: FormData) => void | Promise<void>;
  clients: ClientOpt[];
  brands: Named[];
  distributors: Named[];
  categories: Named[];
  families: Named[];
  products: { id: string; normalizedName: string }[];
  lockedClientId?: string;
}) {
  const [editing, setEditing] = useState<PricingRuleRow | null>(null);
  const [editMode, setEditMode] = useState<"one" | "group">("one");

  function startEditOne(row: PricingRuleRow) {
    setEditing({ ...row, members: undefined });
    setEditMode("one");
  }

  function startEditGroup(members: PricingRuleRow[]) {
    const first = members[0];
    if (!first) return;
    setEditing({ ...first, members });
    setEditMode("group");
  }

  function clearEdit() {
    setEditing(null);
    setEditMode("one");
  }

  const noun = kind === "margin" ? "regla de precio" : "descuento";
  const heading =
    editing && editMode === "group"
      ? `Editar ${noun} (todas las subreglas)`
      : editing
        ? editing.groupId
          ? "Editar subregla"
          : `Editar ${noun}`
        : kind === "margin"
          ? "Nueva regla de precio"
          : "Nueva regla de descuento";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="border-b border-border pb-4">
            <h2 className="heading-3">{heading}</h2>
            {editing ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {editMode === "group"
                  ? "Los cambios se aplican a todo el grupo: marcas, familias, clientes y valor. Después también podés editar una subregla sola."
                  : editing.groupId
                    ? "Solo se actualiza esta subregla. El resto del grupo queda igual."
                    : "Cambiá los campos y guardá. El resto de las reglas no se toca."}
              </p>
            ) : null}
          </div>
          <RulesForm
            key={
              editing
                ? editMode === "group"
                  ? `group-${editing.groupId || editing.id}`
                  : editing.id
                : "new"
            }
            type={kind}
            initial={editing}
            editingGroup={editMode === "group"}
            onSaved={clearEdit}
            onCancel={clearEdit}
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
        deleteGroupAction={deleteGroupAction}
        editingId={editMode === "one" ? editing?.id : undefined}
        editingGroupId={editMode === "group" ? editing?.groupId : undefined}
        onEdit={startEditOne}
        onEditGroup={startEditGroup}
      />
    </div>
  );
}
