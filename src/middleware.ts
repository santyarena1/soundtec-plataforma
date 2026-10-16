import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  // Server Actions POST al URL de la página. Un 302 acá hace que
  // `await action()` resuelva a undefined y el cliente reviente en `.error`.
  if (req.method === "POST" && req.headers.get("next-action")) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const isLogged = !!req.auth?.user;

  // Modo "Catálogo sin precios" (un vendedor le muestra el catálogo a un cliente):
  // el portal y el panel quedan cerrados en este navegador; se ve el catálogo público.
  // Para salir hay que confirmar la clave desde la cinta del catálogo.
  if (req.cookies.get("st_catalogo")?.value === "1" && (pathname.startsWith("/portal") || pathname.startsWith("/admin"))) {
    const product = pathname.match(/^\/portal\/products\/([^/]+)\/?$/);
    const target = new URL(product ? `/catalogo/${product[1]}` : "/catalogo", req.nextUrl);
    if (pathname.startsWith("/portal/products")) target.search = req.nextUrl.search;
    return NextResponse.redirect(target);
  }
  const role = req.auth?.user?.role;
  const perms = req.auth?.user?.perms;

  // Panel: admins y equipo interno (cada pantalla verifica además el permiso puntual).
  const isAdminBase = role === "ADMIN" || role === "SUPER_ADMIN" || role === "STAFF";
  const hasAdminScope =
    perms?.fullAccess === true ||
    (Array.isArray(perms?.scopes) && perms.scopes.some((s) => !s.startsWith("portal.")));

  if (pathname.startsWith("/admin")) {
    if (!isLogged) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (!isAdminBase && !hasAdminScope) {
      return NextResponse.redirect(new URL("/portal", req.nextUrl));
    }
  }

  if (pathname.startsWith("/portal")) {
    if (!isLogged) {
      // Un link de producto compartido debe abrir igual: versión pública sin precios.
      const productMatch = pathname.match(/^\/portal\/products(?:\/([^/]+))?\/?$/);
      if (productMatch) {
        const publicUrl = new URL(
          productMatch[1] ? `/catalogo/${productMatch[1]}` : "/catalogo",
          req.nextUrl
        );
        publicUrl.search = req.nextUrl.search;
        return NextResponse.redirect(publicUrl);
      }
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // "/login?sesion=..." llega desde /salir: no rebotar al panel con una sesión que se está cerrando.
  if (pathname === "/login" && isLogged && !req.nextUrl.searchParams.has("sesion")) {
    const target = isAdminBase || hasAdminScope ? "/admin" : "/portal";
    return NextResponse.redirect(new URL(target, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
