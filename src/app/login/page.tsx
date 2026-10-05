import Link from "next/link";
import { LoginForm } from "./login-form";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands, totalProducts } from "@/lib/catalog-brands";

export const metadata = { title: "Acceso al portal" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    const target =
      session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN" ? "/admin" : "/portal";
    redirect(target);
  }

  const params = await searchParams;
  const brands = await getEquipmentBrands().catch(() => []);
  const total = totalProducts(brands);

  return (
    <AuthShell
      kicker="Portal B2B"
      title="Iniciar sesión"
      subtitle="Accedé con el email y la contraseña de tu cuenta."
      brands={brands}
      total={total}
      footer={
        <>
          <p>
            ¿Todavía no tenés cuenta?{" "}
            <Link href="/solicitar-cuenta" className="font-semibold text-[#1E3552] underline-offset-4 hover:underline">
              Solicitala acá
            </Link>
          </p>
          <p className="text-xs text-[#1E3552]/55">
            ¿Olvidaste tu clave? Escribinos a{" "}
            <a className="underline-offset-4 hover:underline" href="mailto:contacto@soundtec.com.ar">
              contacto@soundtec.com.ar
            </a>
          </p>
        </>
      }
    >
      <LoginForm callbackUrl={params.callbackUrl} initialError={params.error} />
    </AuthShell>
  );
}
