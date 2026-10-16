import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands, totalProducts } from "@/lib/catalog-brands";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Elegí tu clave", robots: { index: false } };

/**
 * Cambio de clave. Obligatorio cuando la clave actual es temporal (la puso un
 * admin): hasta que no elige una propia no puede entrar al panel ni al portal.
 */
export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  const [dbUser, brands] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { mustChangePassword: true } }),
    getEquipmentBrands().catch(() => []),
  ]);
  if (!dbUser) redirect("/login");
  const forced = dbUser.mustChangePassword;
  return (
    <AuthShell
      kicker={forced ? "Primer ingreso" : "Tu cuenta"}
      title={forced ? "Elegí tu clave" : "Cambiar clave"}
      subtitle={
        forced
          ? `Entraste con una clave temporal. Para seguir, elegí una propia para ${user.email}.`
          : `Cambiá la clave de ${user.email}.`
      }
      brands={brands}
      total={totalProducts(brands)}
      footer={<p className="text-xs text-[#1E3552]/55">Al guardarla se cierran tus sesiones abiertas y entrás con la nueva.</p>}
    >
      <ChangePasswordForm email={user.email ?? ""} />
    </AuthShell>
  );
}
