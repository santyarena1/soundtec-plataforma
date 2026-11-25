import { MailboxError } from "@/lib/mail-viewer/types";

/**
 * Conexiones IMAP reutilizables para el visor. Entrar a una casilla cuesta ~8
 * idas y vueltas (TCP, TLS, saludo, ID, LOGIN, NAMESPACE…): con InMotion a
 * 150–300 ms cada una son 1,5–2,5 s. En vez de hacerlo en cada pedido, cada
 * instancia del servidor deja abiertas unas pocas conexiones y las reusa.
 *
 * - Hasta `max` conexiones por casilla; si están todas ocupadas, se espera turno.
 * - Una conexión libre se cierra sola después de `idleMs` sin uso (en Vercel la
 *   instancia se congela entre pedidos: al despertar, si el servidor la cortó,
 *   se descarta y se reintenta una vez con una nueva).
 * - Cada operación tiene tope de tiempo: si se pasa, la conexión se tira.
 *
 * Genérico sobre el cliente para poder probarlo sin servidor.
 */

export type PoolableClient = {
  readonly usable: boolean;
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  /** Comando que no hace nada (NOOP): para ver si una conexión que estuvo quieta sigue viva. */
  noop?(): Promise<unknown>;
};

export type PoolOptions<C extends PoolableClient> = {
  create: () => C;
  max: number;
  idleMs: number;
  operationTimeoutMs: number;
  /** Si estuvo quieta más que esto, antes de usarla se prueba con NOOP (una conexión «medio cortada» colgaría el pedido). */
  checkAfterMs?: number;
  checkTimeoutMs?: number;
};

export type Lease<C> = { client: C; fresh: boolean; release: (healthy: boolean) => void };

type Waiter<C> = { resolve: (lease: Lease<C>) => void; reject: (error: unknown) => void };

/** Errores de conexión (se reintenta con otra); no los de login ni los del servidor. */
export function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; authenticationFailed?: boolean; responseStatus?: string };
  if (e.authenticationFailed || e.responseStatus === "NO" || e.responseStatus === "BAD") return false;
  if (e.code && /^(NoConnection|EConnectionClosed|ECONNRESET|EPIPE|ETIMEDOUT|ETIMEOUT|ECONNABORTED|ClosedAfterConnectTLS|ClosedAfterConnectText)$/i.test(e.code)) return true;
  return /connection not available|connection closed|socket (hang up|closed)|unexpected close|read ECONNRESET/i.test(e.message ?? "");
}

export class ImapPool<C extends PoolableClient> {
  private idle: C[] = [];
  private total = 0;
  private waiters: Waiter<C>[] = [];
  private timers = new Map<C, ReturnType<typeof setTimeout>>();
  private lastUsed = new Map<C, number>();
  private closed = false;
  /** Conexiones abiertas en toda la vida del pool (para medir). */
  connectsCount = 0;

  constructor(private readonly options: PoolOptions<C>) {}

  get size(): { idle: number; busy: number; waiting: number } {
    return { idle: this.idle.length, busy: this.total - this.idle.length, waiting: this.waiters.length };
  }

  private discard(client: C): void {
    this.clearTimer(client);
    this.lastUsed.delete(client);
    this.total--;
    // logout prolijo si se puede; si no, se corta.
    if (client.usable) client.logout().catch(() => client.close());
    else client.close();
  }

  private clearTimer(client: C): void {
    const timer = this.timers.get(client);
    if (timer) clearTimeout(timer);
    this.timers.delete(client);
  }

  private async open(): Promise<C> {
    this.total++;
    const client = this.options.create();
    try {
      await client.connect();
      this.connectsCount++;
      return client;
    } catch (error) {
      this.total--;
      client.close();
      this.wake();
      throw error;
    }
  }

  /** Atiende al primero que espera si hay lugar para una conexión nueva. */
  private wake(): void {
    while (this.waiters.length && this.total < this.options.max) {
      const waiter = this.waiters.shift()!;
      this.open().then(
        (client) => waiter.resolve(this.lease(client, true)),
        (error) => waiter.reject(error)
      );
    }
  }

  private lease(client: C, fresh: boolean): Lease<C> {
    let done = false;
    return {
      client,
      fresh,
      release: (healthy: boolean) => {
        if (done) return;
        done = true;
        this.giveBack(client, healthy);
      },
    };
  }

  private giveBack(client: C, healthy: boolean): void {
    if (!healthy || !client.usable || this.closed) {
      this.discard(client);
      this.wake();
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(this.lease(client, false));
      return;
    }
    this.idle.push(client);
    this.lastUsed.set(client, Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(client);
      const i = this.idle.indexOf(client);
      if (i === -1) return;
      this.idle.splice(i, 1);
      this.discard(client);
    }, this.options.idleMs);
    // No mantiene vivo el proceso (scripts, tests).
    (timer as { unref?: () => void }).unref?.();
    this.timers.set(client, timer);
  }

  /** Una conexión para uso exclusivo; hay que devolverla con `release`. */
  async acquire(): Promise<Lease<C>> {
    if (this.closed) throw new MailboxError("La casilla se está cerrando.", "connect");
    while (this.idle.length) {
      // La usada más recientemente: es la que menos chance tiene de estar cortada.
      const client = this.idle.pop()!;
      this.clearTimer(client);
      if (client.usable && (await this.alive(client))) return this.lease(client, false);
      this.discard(client);
    }
    if (this.total < this.options.max) return this.lease(await this.open(), true);
    return new Promise<Lease<C>>((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  /** Tras un rato quieta (en Vercel, la instancia pudo estar congelada), un NOOP corto confirma que sigue viva. */
  private async alive(client: C): Promise<boolean> {
    const checkAfter = this.options.checkAfterMs ?? 45_000;
    if (!client.noop || Date.now() - (this.lastUsed.get(client) ?? 0) < checkAfter) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), this.options.checkTimeoutMs ?? 3_000)));
    const ok = await Promise.race([client.noop().then(() => client.usable, () => false), timeout]);
    clearTimeout(timer);
    return ok;
  }

  /** Abre una conexión de antemano si no hay ninguna (no espera ni falla). */
  warm(): void {
    if (this.closed || this.total > 0) return;
    this.open().then(
      (client) => this.giveBack(client, true),
      () => undefined
    );
  }

  /**
   * Corre `run` con una conexión del pool. Si la conexión reusada resultó
   * cortada, reintenta una vez con una nueva (las lecturas son idempotentes).
   */
  async run<T>(run: (client: C) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const lease = await this.acquire();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Si se pasa del tope, se corta la conexión y se responde sin esperar a la operación colgada.
        const result = await new Promise<T>((resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            lease.client.close();
            reject(new Error("timeout"));
          }, this.options.operationTimeoutMs);
          run(lease.client).then(resolve, reject);
        });
        clearTimeout(timer);
        lease.release(true);
        return result;
      } catch (error) {
        clearTimeout(timer);
        // Un «no existe» del servidor no invalida la conexión; un corte o un vencimiento sí.
        lease.release(!timedOut && !isConnectionError(error) && lease.client.usable);
        if (timedOut) throw new MailboxError("La casilla tardó demasiado en responder. Probá de nuevo en un rato.", "timeout");
        if (attempt === 0 && !lease.fresh && isConnectionError(error)) continue;
        throw error;
      }
    }
  }

  /** Cierra todo (al cambiar la contraseña, en tests). */
  close(): void {
    this.closed = true;
    for (const client of this.idle.splice(0)) this.discard(client);
    for (const waiter of this.waiters.splice(0)) waiter.reject(new MailboxError("La casilla se cerró.", "connect"));
  }
}
