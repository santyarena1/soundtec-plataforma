import { revalidatePath } from "next/cache";

/** Pantallas que muestran precios o reglas: se refrescan al aplicar un cambio. */
export function revalidatePriceViews(): void {
  for (const path of ["/admin/margins", "/admin/discounts", "/admin/products", "/admin/price-reviews", "/admin/categories", "/portal/products"]) {
    revalidatePath(path);
  }
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/admin/visibility");
}
