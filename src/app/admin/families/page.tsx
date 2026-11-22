import { redirect } from "next/navigation";

/** Las familias se retiraron: su lugar lo ocupa la pestaña «Series» de Rubros. */
export default function AdminFamiliesPage(): never {
  redirect("/admin/categories/series");
}
