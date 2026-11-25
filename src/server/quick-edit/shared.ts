/**
 * Piezas comunes de la edición rápida (ficha del portal): permiso, refresco de
 * pantallas y el puente con `upsertProduct`, la misma acción que usa la ficha
 * del admin (validaciones, rubro por revisión, marcas de campo editado a mano).
 */
import { revalidatePath } from "next/cache";
import type { Product } from "@prisma/client";
import { requireStaff } from "@/lib/auth-helpers";
import { quickEditAccess, type QuickEditAccess } from "@/lib/quick-edit/access";
import { prisma } from "@/lib/prisma";
import { upsertProduct } from "@/server/actions/admin-catalog";

export type QuickEditResult = { ok: true; notice?: string } | { ok: false; error: string };

/** Igual que las acciones del panel: products.edit con acceso a costos. Un cliente es redirigido. */
export async function requireQuickEdit(): Promise<{ user: { id: string; name: string | null; email: string | null }; access: QuickEditAccess }> {
  const staff = await requireStaff("products.edit", { costs: true });
  const access = quickEditAccess(staff.user.role, staff.permissions);
  if (!access.canOpen) throw new Error("Sin permiso para editar productos.");
  return { user: { id: staff.user.id, name: staff.user.name ?? null, email: staff.user.email ?? null }, access };
}

export const actorOf = (user: { id: string; name: string | null; email: string | null }) => ({ id: user.id, name: user.name ?? user.email ?? null });

/** Ficha del portal, catálogo público y admin. */
export function refreshProductViews(productId: string) {
  for (const path of [`/portal/products/${productId}`, `/catalogo/${productId}`, `/admin/products/${productId}`]) revalidatePath(path);
  revalidatePath("/portal/products");
  revalidatePath("/catalogo");
  revalidatePath("/admin/products");
}

export type ProductPatch = Partial<{
  normalizedName: string;
  shortDescription: string | null;
  longDescription: string | null;
  baseCostUsd: number;
  distributorId: string | null;
  coefNac: number | null;
  coefVta: number | null;
  coefVtaFob: number | null;
  tariffDutyPercent: number | null;
  ivaPercent: number | null;
  impIntPercent: number | null;
  discountPercent: number | null;
  requiresQuote: boolean;
  brandId: string | null;
  categoryId: string | null;
  lineId: string | null;
  commercialTag: string | null;
  isFeatured: boolean;
  isActive: boolean;
  stockStatus: Product["stockStatus"];
  stockQuantity: number | null;
  kind: Product["kind"];
}>;

const text = (v: unknown) => (v == null ? "" : String(v));

/**
 * El formulario completo de la ficha del admin con los valores actuales y el
 * cambio encima: `upsertProduct` reescribe todos los campos que recibe, así que
 * se le manda todo para no borrar nada sin querer.
 */
export function productFormData(current: Product, patch: ProductPatch): FormData {
  const v = { ...current, ...patch } as Product & ProductPatch;
  const fd = new FormData();
  const set = (key: string, value: unknown) => fd.set(key, text(value));
  fd.set("id", current.id);
  for (const key of [
    "internalSku",
    "supplierSku",
    "normalizedName",
    "originalName",
    "brandId",
    "distributorId",
    "categoryId",
    "familyId",
    "lineId",
    "familia",
    "line",
    "tipo",
    "shortDescription",
    "longDescription",
    "baseCostUsd",
    "discountPercent",
    "tariffPosition",
    "tariffDutyPercent",
    "aecPercent",
    "tePercent",
    "coo",
    "weight",
    "volume",
    "coefNac",
    "coefVta",
    "ivaPercent",
    "impIntPercent",
    "coefVtaFob",
    "stockStatus",
    "stockQuantity",
    "commercialTag",
    "kind",
  ] as const) {
    set(key, v[key]);
  }
  for (const flag of ["isCustomizable", "isCrestronHomeCompatible", "accessoryRequiredWithPrimary", "isActive"] as const) {
    fd.set(flag, v[flag] ? "true" : "false");
  }
  fd.set("requiresQuotePresent", "1");
  if (v.requiresQuote) fd.set("requiresQuote", "on");
  fd.set("isFeaturedPresent", "1");
  if (v.isFeatured) fd.set("isFeatured", "on");
  return fd;
}

/** Guarda un cambio de la ficha con la acción del admin. */
export async function saveProductPatch(productId: string, patch: ProductPatch): Promise<QuickEditResult> {
  const current = await prisma.product.findUnique({ where: { id: productId } });
  if (!current) return { ok: false, error: "El producto no existe." };
  const result = await upsertProduct(productFormData(current, patch));
  if (!result.ok) return { ok: false, error: result.error ?? "No se pudo guardar." };
  refreshProductViews(productId);
  return { ok: true, notice: result.notice };
}
