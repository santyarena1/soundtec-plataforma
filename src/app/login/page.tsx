import Link from "next/link";
import { LoginForm } from "./login-form";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

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

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-foreground text-primary text-sm font-bold">
            S
          </span>
          Soundtec S.R.L.
        </Link>

        <div className="space-y-6">
          <p className="text-xs uppercase tracking-widest text-primary-foreground/70">Portal B2B</p>
          <h2 className="text-3xl font-semibold leading-tight">
            Tu acceso seguro a listas de precios, configuraciones y solicitudes de presupuesto.
          </h2>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Soundtec ofrece soluciones audiovisuales integradas para integradores, instaladores y proyectos
            corporativos, educativos, culturales y de eventos.
          </p>
        </div>

        <p className="text-xs text-primary-foreground/60">
          ¿Necesitás acceso? Contactanos a{" "}
          <a className="underline" href="mailto:contacto@soundtec.com.ar">
            contacto@soundtec.com.ar
          </a>
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <Link href="/" className="inline-flex items-center gap-2 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
                S
              </span>
              <span className="font-semibold">Soundtec</span>
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
            <p className="muted-text mt-1">Accedé al portal con tus credenciales corporativas.</p>
          </div>

          <LoginForm callbackUrl={params.callbackUrl} initialError={params.error} />

          <p className="muted-text mt-6 text-center text-xs">
            ¿Olvidaste tu clave? Escribinos a{" "}
            <a className="text-accent hover:underline" href="mailto:contacto@soundtec.com.ar">
              contacto@soundtec.com.ar
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
