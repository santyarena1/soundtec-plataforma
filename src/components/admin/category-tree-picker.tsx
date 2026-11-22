"use client";

import type { CategoryNode } from "@/lib/category-tree";
import { RubroPicker } from "@/components/admin/rubro-picker";

/**
 * Elegir el rubro de un producto (un solo valor). Es el selector único de
 * rubros (`RubroPicker`) en modo simple; se mantiene este nombre porque lo
 * usan varias pantallas. Se guarda en un input oculto con `name`.
 */
export function CategoryTreePicker({
  nodes,
  name,
  defaultValue,
  id,
  onChange,
  allowCreate,
}: {
  nodes: CategoryNode[];
  name: string;
  defaultValue?: string | null;
  id?: string;
  /** Avisa el rubro elegido. */
  onChange?: (categoryId: string) => void;
  /** «Crear subrubro acá» (el servidor exige permiso de catálogo). */
  allowCreate?: boolean;
}) {
  return <RubroPicker nodes={nodes} name={name} defaultValue={defaultValue} id={id} onChange={onChange} allowCreate={allowCreate} />;
}
