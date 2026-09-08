"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { RulesForm } from "./rules-form";
import { ProductCoverageView } from "./product-coverage-view";
import { PricingRulesTable, type PricingRuleRow } from "@/components/admin/pricing-rules-table";

type Named = { id: string; name: string };
type ClientOpt = { id: string; name: string; companyName?: string | null };
export function PricingRulesWorkspace({ kind, rows, empty, deleteAction, deleteGroupAction, clients, brands, distributors, categories, families, products, lockedClientId }: {
  kind: "margin" | "discount"; rows: PricingRuleRow[]; empty: string; deleteAction: (formData: FormData) => void | Promise<void>; deleteGroupAction: (formData: FormData) => void | Promise<void>;
  clients: ClientOpt[]; brands: Named[]; distributors: Named[]; categories: Named[]; families: Named[]; products: { id: string; normalizedName: string }[]; lockedClientId?: string;
}) {
  const params = useSearchParams(); const [editing, setEditing] = useState<PricingRuleRow | null>(null); const [editMode, setEditMode] = useState<"one" | "group">("one");
  function startEditOne(row: PricingRuleRow) { setEditing({ ...row, members: undefined }); setEditMode("one"); }
  function startEditGroup(members: PricingRuleRow[]) { if (!members[0]) return; setEditing({ ...members[0], members }); setEditMode("group"); }
  function clearEdit() { setEditing(null); setEditMode("one"); }
  const noun = kind === "margin" ? "regla de precio" : "descuento";
  const heading = editing && editMode === "group" ? `Editar ${noun} (todas las subreglas)` : editing ? editing.groupId ? "Editar subregla" : `Editar ${noun}` : kind === "margin" ? "Nueva regla de precio" : "Nueva regla de descuento";
  const rules = <div className="space-y-6"><Card><CardContent className="space-y-5 p-6"><div className="border-b border-border pb-4"><h2 className="heading-3">{heading}</h2>{editing ? <p className="mt-1 text-sm text-muted-foreground">{editMode === "group" ? "Los cambios se aplican a todo el grupo. Previsualizá para exceptuar productos." : editing.groupId ? "Sólo se actualiza esta subregla." : "Cambiá los campos y guardá."}</p> : null}</div><RulesForm key={editing ? editMode === "group" ? `group-${editing.groupId || editing.id}` : editing.id : "new"} type={kind} initial={editing} editingGroup={editMode === "group"} onSaved={clearEdit} onCancel={clearEdit} lockedClientId={lockedClientId} clients={clients} brands={brands} distributors={distributors} categories={categories} families={families} products={products} /></CardContent></Card><PricingRulesTable kind={kind} rows={rows} empty={empty} deleteAction={deleteAction} deleteGroupAction={deleteGroupAction} editingId={editMode === "one" ? editing?.id : undefined} editingGroupId={editMode === "group" ? editing?.groupId : undefined} onEdit={startEditOne} onEditGroup={startEditGroup} /></div>;
  if (lockedClientId) return rules;
  return <Tabs defaultTab={params.get("view") === "products" ? "products" : "rules"} syncParam="view" tabs={[{ id: "rules", label: "Reglas", content: rules }, { id: "products", label: "Por producto", content: <ProductCoverageView kind={kind} clients={clients.map((x) => ({ id: x.id, name: x.companyName || x.name }))} brands={brands} distributors={distributors} categories={categories} families={families} products={products} /> }]} />;
}