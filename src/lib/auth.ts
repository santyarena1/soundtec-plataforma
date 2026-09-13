import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { basePrisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { parsePermissions, type Permissions } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      companyName?: string | null;
      clientId?: string | null;
      sessionVersion?: number;
      perms?: Permissions | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
    companyName?: string | null;
    clientId?: string | null;
    sessionVersion?: number;
    perms?: Permissions | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type TokenBag = Record<string, unknown>;

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
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const limited = await enforceRateLimit(`login:${email}`, { limit: 8, windowMs: 15 * 60 * 1000 });
        if (!limited.ok) return null;

        const user = await basePrisma.user.findUnique({
          where: { email },
          include: { customRole: { select: { permissionsJson: true, isActive: true } } },
        });
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        await basePrisma.user
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
          clientId: user.clientId,
          sessionVersion: user.sessionVersion,
          perms,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      const t = token as TokenBag;
      if (user) {
        const u = user as {
          id?: string;
          role?: UserRole;
          companyName?: string | null;
          clientId?: string | null;
          sessionVersion?: number;
          perms?: Permissions | null;
        };
        if (u.id) t.id = u.id;
        if (u.role) t.role = u.role;
        t.companyName = u.companyName ?? null;
        t.clientId = u.clientId ?? null;
        t.sv = u.sessionVersion ?? 0;
        t.perms = u.perms ?? null;
      }
      return t;
    },
    session: ({ session, token }) => {
      const t = token as TokenBag;
      if (session.user) {
        if (typeof t.id === "string") session.user.id = t.id;
        if (t.role) session.user.role = t.role as UserRole;
        session.user.companyName = (t.companyName as string | null) ?? null;
        session.user.clientId = (t.clientId as string | null) ?? null;
        session.user.sessionVersion = typeof t.sv === "number" ? t.sv : 0;
        session.user.perms = (t.perms as Permissions | null) ?? null;
      }
      return session;
    },
    authorized: ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      const isLogged = !!auth?.user;
      const role = auth?.user?.role;
      const perms = auth?.user?.perms;

      const isAdminBase = role === "ADMIN" || role === "SUPER_ADMIN";
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
