import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands, totalProducts } from "@/lib/catalog-brands";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TwoFactorPanel } from "./two-factor-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguridad de la cuenta", robots: { index: false } };

/** Verificación en dos pasos: además de la clave, un código de 6 dígitos de una app del celular. */
export default async function AccountSecurityPage() {
  const user = await requireUser();
  const [dbUser, brands] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true, email: true, role: true } }),
    getEquipmentBrands().catch(() => []),
  ]);
  if (!dbUser) redirect("/login");
  const panelUser = dbUser.role !== "CLIENT";
  return (
    <AuthShell
      kicker="Tu cuenta"
      title="Verificación en dos pasos"
      subtitle={`Además de la clave, al ingresar con ${dbUser.email} se pide un código de 6 dígitos que genera una app en tu celular. Si alguien consigue tu clave, igual no puede entrar.`}
      brands={brands}
      total={totalProducts(brands)}
      footer={
        <p className="text-xs text-[#1E3552]/55">
          {panelUser ? "Recomendada para todo el equipo, y obligatoria en la práctica para administradores. " : ""}
          Si perdés el celular, pedile a un administrador que te la quite.
        </p>
      }
    >
      <TwoFactorPanel enabled={dbUser.twoFactorEnabled} backHref={panelUser ? "/admin" : "/portal"} />
    </AuthShell>
  );
}
