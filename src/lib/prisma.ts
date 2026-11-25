import { PrismaClient } from "@prisma/client";
import { IMPERSONATION_COOKIE, READ_ONLY_MESSAGE } from "@/lib/impersonation/token";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

/**
 * Medidor de consultas (solo local): con PERF_PRISMA_LOG=<archivo> cada consulta se
 * anota en ese archivo como «ms<TAB>sql». Lo lee scripts/perf-admin.ts para contar
 * consultas y su duración por pantalla. Sin la variable no cambia nada.
 */
const PERF_LOG_FILE =
  typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge" ? process.env.PERF_PRISMA_LOG : undefined;

function createClient(): PrismaClient {
  const base: Array<"error" | "warn"> = process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
  if (!PERF_LOG_FILE) return new PrismaClient({ log: base });
  const client = new PrismaClient({ log: [...base, { emit: "event", level: "query" }] });
  // Sin import estático: este archivo llega (sin usarse) a bundles de cliente y de Edge.
  const { appendFileSync } = (process as unknown as { getBuiltinModule: (id: string) => typeof import("fs") }).getBuiltinModule("fs");
  (client as unknown as { $on: (e: "query", cb: (ev: { duration: number; query: string }) => void) => void }).$on("query", (ev) => {
    try {
      appendFileSync(PERF_LOG_FILE, `${ev.duration}\t${ev.query.replace(/\s+/g, " ").slice(0, 400)}\n`);
    } catch {
      // medidor local: si no se puede escribir, se ignora
    }
  });
  return client;
}

export const prisma = global.__prismaClient || createClient();

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
