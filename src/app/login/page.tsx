import Link from "next/link";
import { LoginForm } from "./login-form";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEquipmentBrands, totalProducts } from "@/lib/catalog-brands";

export const metadata = { title: "Acceso al portal" };

const SESSION_NOTICES: Record<string, string> = {
  clave: "Tu clave quedó guardada. Ingresá con la nueva.",
  inactivo: "Tu usuario está desactivado. Si es un error, escribinos.",
  cambios: "Cambiaron tus accesos o tu clave. Volvé a ingresar.",
  usuario: "Tu usuario ya no existe.",
  cerrada: "Cerraste la sesión.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; sesion?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  // Con "?sesion=..." venimos de cerrar una sesión vencida: no rebotar al panel.
  if (session?.user && !params.sesion) {
    const role = session.user.role;
    redirect(role === "ADMIN" || role === "SUPER_ADMIN" || role === "STAFF" ? "/admin" : "/portal");
  }
  const notice = params.sesion ? SESSION_NOTICES[params.sesion] ?? SESSION_NOTICES.cerrada : null;

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
      {notice ? (
        <p className="mb-4 rounded-md border border-[#1E3552]/15 bg-[#1E3552]/5 p-3 text-sm">{notice}</p>
      ) : null}
      <LoginForm callbackUrl={params.callbackUrl} initialError={params.error} />
    </AuthShell>
  );
}
