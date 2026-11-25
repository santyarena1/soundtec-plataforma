import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands, totalProducts } from "@/lib/catalog-brands";
import { countCustomerVisibleProducts } from "@/lib/catalog";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Olvidé mi clave", robots: { index: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const params = await searchParams;
  const brands = await getEquipmentBrands().catch(() => []);
  const total = await countCustomerVisibleProducts().catch(() => totalProducts(brands));
  return (
    <AuthShell
      kicker="Recuperar acceso"
      title="¿Olvidaste tu clave?"
      subtitle="Escribí el mail de tu cuenta y te mandamos un link para elegir una nueva."
      brands={brands}
      total={total}
      footer={
        <p>
          ¿La recordaste?{" "}
          <Link href="/login" className="font-semibold text-[#1E3552] underline-offset-4 hover:underline">
            Volver a ingresar
          </Link>
        </p>
      }
    >
      <ForgotForm initialEmail={typeof params.email === "string" ? params.email.slice(0, 200) : ""} />
    </AuthShell>
  );
}
