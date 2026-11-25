import { PrismaClient } from "@prisma/client";
import { IMPERSONATION_COOKIE, READ_ONLY_MESSAGE } from "@/lib/impersonation/token";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma =
  global.__prismaClient ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
}

/** Escritura frenada porque el pedido viene de una vista «Ver como» (solo lectura). */
export class ReadOnlyViewError extends Error {
  constructor() {
    super(READ_ONLY_MESSAGE);
    this.name = "ReadOnlyViewError";
  }
}

const WRITE_ACTIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "delete", "deleteMany", "executeRaw", "executeRawUnsafe"]);
/** Lo único que se escribe durante la vista: su propio registro de auditoría. */
const WRITABLE_DURING_VIEW = new Set(["ImpersonationLog"]);

/** ¿El pedido en curso trae la cookie de «Ver como»? Fuera de un pedido (scripts, cron) no hay vista. */
async function requestIsReadOnlyView(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    return Boolean(cookies().get(IMPERSONATION_COOKIE)?.value);
  } catch {
    return false;
  }
}

// Última barrera de «Ver como»: aunque alguna pantalla escriba al renderizar o se
// escape una acción, con la vista activa la base no acepta cambios. El middleware
// ya frena los envíos; esto cubre lo que corre en lecturas (GET).
const GUARDED = Symbol.for("soundtec.prisma.readOnlyViewGuard");
const guarded = prisma as PrismaClient & { [GUARDED]?: boolean };
// Solo en el servidor. En Edge (middleware) Prisma no corre. En el navegador, si un componente cliente
// importa sin querer algo que usa Prisma, el cliente es un sustituto que tira error apenas se lo toca:
// eso rompía el editor de cotizaciones (25/11).
if (typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge" && !guarded[GUARDED]) {
  guarded[GUARDED] = true;
  prisma.$use(async (params, next) => {
    if (WRITE_ACTIONS.has(params.action) && !(params.model && WRITABLE_DURING_VIEW.has(params.model)) && (await requestIsReadOnlyView())) {
      throw new ReadOnlyViewError();
    }
    return next(params);
  });
}
