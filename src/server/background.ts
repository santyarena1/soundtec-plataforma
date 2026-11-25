/**
 * Trabajo que sigue después de responder. En Vercel se registra con el
 * `waitUntil` del contexto del pedido (lo mismo que hace @vercel/functions),
 * así la función no se congela antes de terminar. En un servidor normal
 * (next dev / next start) el proceso sigue vivo y la promesa corre sola.
 * Si en Vercel no aparece el contexto, devuelve la promesa para esperarla ahí.
 */
type RequestContext = { waitUntil?: (promise: Promise<unknown>) => void };

function vercelContext(): RequestContext | undefined {
  const store = (globalThis as Record<symbol, { get?: () => RequestContext | undefined } | undefined>)[Symbol.for("@vercel/request-context")];
  return store?.get?.();
}

export function runAfterResponse(task: () => Promise<void>): Promise<void> | null {
  const promise = task();
  const ctx = vercelContext();
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise);
    return null;
  }
  if (process.env.VERCEL) return promise;
  void promise;
  return null;
}
