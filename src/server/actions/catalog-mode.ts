"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireUser } from "@/lib/auth-helpers";
import { CATALOG_MODE_COOKIE, CATALOG_MODE_MAX_AGE } from "@/lib/catalog-mode";
import { consumeRateLimit } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };

/** Activa el catálogo sin precios en este navegador. */
export async function enableCatalogMode(): Promise<Result> {
  await requireStaff("catalog_mode.use");
  cookies().set(CATALOG_MODE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CATALOG_MODE_MAX_AGE,
  });
  return { ok: true };
}

/**
 * Sale del modo con la clave del usuario logueado: así un cliente que tiene
 * el celular del vendedor en la mano no puede ver los precios.
 */
export async function disableCatalogMode(password: string): Promise<Result> {
  const user = await requireUser();
  const limit = await consumeRateLimit(`catalog-mode-exit:${user.id}`, 8, 15 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Demasiados intentos. Esperá unos minutos." };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !password || !(await bcrypt.compare(password, row.passwordHash))) return { ok: false, error: "Clave incorrecta." };
  cookies().delete(CATALOG_MODE_COOKIE);
  return { ok: true };
}
