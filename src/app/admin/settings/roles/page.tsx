import { redirect } from "next/navigation";

/** Los roles se editan en un solo lugar: Usuarios y permisos → Roles. */
export default function SettingsRolesRedirect() {
  redirect("/admin/users?vista=roles");
}
