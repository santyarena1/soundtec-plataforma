/**
 * Edición rápida desde la ficha del portal (botón flotante del lápiz): quién la
 * ve y qué partes puede tocar. Mismas reglas que las acciones del panel:
 * editar productos exige acceso a costos (products.edit va con «costs»), los
 * márgenes piden margins.manage y las reglas de descuento discounts.manage.
 * Un cliente del portal nunca la ve, aunque su rol tuviera el permiso.
 */
import { canSeeCosts, isPanelRole, permissionsHave, type Permissions } from "@/lib/permissions";

export interface QuickEditAccess {
  /** Ve el botón y abre el panel. */
  canOpen: boolean;
  /** Pestaña Precios: costo, coeficientes y descuento propio (edición directa del producto). */
  canEditPrices: boolean;
  /** Markup propio del producto y simular reglas de margen. */
  canEditMargins: boolean;
  /** Simular y proponer cambios en reglas de descuento. */
  canEditDiscountRules: boolean;
  /** «Crear subrubro acá» en el selector de rubro. */
  canCreateSubrubro: boolean;
}

export const NO_QUICK_EDIT: QuickEditAccess = {
  canOpen: false,
  canEditPrices: false,
  canEditMargins: false,
  canEditDiscountRules: false,
  canCreateSubrubro: false,
};

export function quickEditAccess(role: string | null | undefined, permissions: Permissions | null | undefined): QuickEditAccess {
  if (!isPanelRole(role) || !permissions) return NO_QUICK_EDIT;
  const costs = canSeeCosts(permissions);
  if (!costs || !permissionsHave(permissions, "products.edit")) return NO_QUICK_EDIT;
  return {
    canOpen: true,
    canEditPrices: true,
    canEditMargins: permissionsHave(permissions, "margins.manage"),
    canEditDiscountRules: permissionsHave(permissions, "discounts.manage"),
    canCreateSubrubro: permissionsHave(permissions, "categories.manage"),
  };
}
