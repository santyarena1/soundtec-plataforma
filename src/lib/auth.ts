import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { parsePermissions, type Permissions } from "@/lib/permissions";
import { allowIpAttempt, clearFailedLogins, isEmailLocked, loginIpHash, recordFailedLogin } from "@/lib/login-guard";

/** Demasiados intentos: el formulario lo muestra con su propio mensaje. */
class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

// Hash de una clave cualquiera: si el email no existe se compara igual, así la
// demora no delata qué emails están dados de alta.
const DUMMY_HASH = "$2a$12$KCLJaskrFP1AirCivvq66OkNxSdHsY23rvh4QlRFh1wOzvpPhwnIO";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      companyName?: string | null;
      perms?: Permissions | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
    companyName?: string | null;
    perms?: Permissions | null;
  }
}

// Nota: la augmentación del JWT se hace de forma laxa en los callbacks (cast),
// porque el módulo "next-auth/jwt" en la beta de v5 no expone tipos estables.

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();

        const ipHash = await loginIpHash(request?.headers ?? new Headers());
        if (!(await allowIpAttempt(ipHash)) || (await isEmailLocked(email))) {
          console.warn("[auth] ingreso frenado por intentos", { email, ipHash });
          throw new TooManyAttempts();
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { customRole: { select: { permissionsJson: true, isActive: true } } },
        });
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.isActive || !ok) {
          await recordFailedLogin(email);
          return null;
        }
        await clearFailedLogins(email);

        await prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => null);

        const perms = user.customRole?.isActive
          ? parsePermissions(user.customRole.permissionsJson as unknown)
          : null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyName: user.companyName,
          perms,
          sv: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        const u = user as {
          id?: string;
          role?: UserRole;
          companyName?: string | null;
          perms?: Permissions | null;
          sv?: number;
        };
        if (u.id) (token as Record<string, unknown>).id = u.id;
        // Versión de sesión: si en la base sube (reset de clave, baja, cambio de tipo), esta sesión deja de valer.
        (token as Record<string, unknown>).sv = u.sv ?? 0;
        if (u.role) (token as Record<string, unknown>).role = u.role;
        (token as Record<string, unknown>).companyName = u.companyName ?? null;
        (token as Record<string, unknown>).perms = u.perms ?? null;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        const t = token as {
          id?: string;
          role?: UserRole;
          companyName?: string | null;
          perms?: Permissions | null;
          sv?: number;
        };
        if (t.id) session.user.id = t.id;
        (session.user as { sv?: number }).sv = t.sv ?? 0;
        if (t.role) session.user.role = t.role;
        session.user.companyName = t.companyName ?? null;
        session.user.perms = t.perms ?? null;
      }
      return session;
    },
    authorized: ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      const isLogged = !!auth?.user;
      const role = auth?.user?.role;
      const perms = auth?.user?.perms;

      const isAdminBase = role === "ADMIN" || role === "SUPER_ADMIN" || role === "STAFF";
      const hasAdminScope =
        perms?.fullAccess === true ||
        (Array.isArray(perms?.scopes) && perms.scopes.some((s) => !s.startsWith("portal.")));

      if (pathname.startsWith("/admin")) {
        return isLogged && (isAdminBase || hasAdminScope);
      }
      if (pathname.startsWith("/portal")) {
        return isLogged;
      }
      return true;
    },
  },
  trustHost: true,
});
