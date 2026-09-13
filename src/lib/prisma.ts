import { PrismaClient } from "@prisma/client";
import { extendWithTenantGuard } from "@/lib/tenant-guard";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

const basePrisma =
  global.__prismaClient ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = basePrisma;
}

/** Cliente sin filtro de tenant. Solo settings, cron y el propio guard. */
export { basePrisma };

/** Cliente de la app: inyecta aislamiento cuando el actor es un cliente de portal. */
export const prisma = extendWithTenantGuard(basePrisma) as unknown as PrismaClient;
