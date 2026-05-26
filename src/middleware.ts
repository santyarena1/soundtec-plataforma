import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLogged = !!req.auth?.user;
  const role = req.auth?.user?.role;
  const perms = req.auth?.user?.perms;

  const isAdminBase = role === "ADMIN" || role === "SUPER_ADMIN";
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
