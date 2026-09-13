import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_API = [/^\/api\/auth(?:\/|$)/, /^\/api\/cron(?:\/|$)/, /^\/api\/setup(?:\/|$)/];

export default auth((req) => {
  // Server Actions POST al URL de la página. Un 302 acá hace que
  // `await action()` resuelva a undefined y el cliente reviente en `.error`.
  if (req.method === "POST" && req.headers.get("next-action")) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const isLogged = !!req.auth?.user;
  const role = req.auth?.user?.role;
  const perms = req.auth?.user?.perms;

  const isAdminBase = role === "ADMIN" || role === "SUPER_ADMIN";
  const hasAdminScope =
    perms?.fullAccess === true ||
    (Array.isArray(perms?.scopes) && perms.scopes.some((s) => !s.startsWith("portal.")));

  if (pathname.startsWith("/api")) {
    if (PUBLIC_API.some((re) => re.test(pathname))) return NextResponse.next();
    if (!isLogged) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (pathname.startsWith("/api/admin") && !isAdminBase && !hasAdminScope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (pathname.startsWith("/api/portal") && !isLogged) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

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

  if (pathname === "/login" && isLogged) {
    const target = isAdminBase || hasAdminScope ? "/admin" : "/portal";
    return NextResponse.redirect(new URL(target, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
