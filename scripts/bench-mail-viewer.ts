/**
 * Benchmark del visor de correo (Sistema › Correo del portal) contra una casilla
 * IMAP de PRUEBA — nunca la real. Mide cada acción como la hace la página.
 *
 *   MAIL_VIEWER_BENCH_IMAP=127.0.0.1:11431 npx tsx scripts/bench-mail-viewer.ts
 *
 * Para emular InMotion se usó hoodiecrow-imap (IMAP en memoria, ~1700 mails) detrás
 * de un proxy TCP que agrega 200 ms por ida y vuelta, 3 idas y vueltas de TCP+TLS
 * al conectar y 1,5 MB/s de bajada. Si el proxy expone estadísticas
 * (MAIL_VIEWER_BENCH_STATS=http://127.0.0.1:11432), se muestran conexiones y comandos.
 * Usuario y clave: MAIL_VIEWER_BENCH_USER / MAIL_VIEWER_BENCH_PASS (testuser / testpass).
 */
import { createImapProvider } from "@/server/mail-viewer/imap-provider";
import { invalidateListings, listMessages, loadFolders, loadThread, openMessage, preparedHtml } from "@/server/mail-viewer/service";
import { parseFilters } from "@/lib/mail-viewer/search";

const target = process.env.MAIL_VIEWER_BENCH_IMAP;
if (!target || /soundtec\.com\.ar/i.test(target)) {
  console.error("Definí MAIL_VIEWER_BENCH_IMAP=host:puerto de una casilla de prueba (no la real).");
  process.exit(1);
}
const [host, port] = target.split(":");
const STATS = process.env.MAIL_VIEWER_BENCH_STATS;
const account = { host: host!, imapPort: Number(port) || 143, user: process.env.MAIL_VIEWER_BENCH_USER ?? "testuser", password: process.env.MAIL_VIEWER_BENCH_PASS ?? "testpass", fromName: "Bench", smtpPort: 465 };

async function measure(name: string, fn: () => Promise<unknown>): Promise<void> {
  if (STATS) await fetch(`${STATS}/reset`);
  const t = performance.now();
  await fn();
  const ms = Math.round(performance.now() - t);
  let extra = "";
  if (STATS) {
    const s = (await (await fetch(`${STATS}/stats`)).json()) as { connections: number; commands: Record<string, number>; bytesDown: number };
    extra = ` · ${s.connections} conexiones · ${Math.round(s.bytesDown / 1024)} KB`;
  }
  console.log(`${name.padEnd(48)} ${String(ms).padStart(6)} ms${extra}`);
}

async function main(): Promise<void> {
  const provider = createImapProvider(account);
  const all = parseFilters({});
  let firstUid = 0;
  let heavyUid = 0;
  await measure("entrar (frío: conecta y lista)", async () => {
    const [, page] = await Promise.all([loadFolders(provider), listMessages(provider, "INBOX", all, 1)]);
    firstUid = page.messages[0]?.uid ?? 0;
    heavyUid = page.messages.find((m) => m.hasAttachments && m.size > 600_000)?.uid ?? firstUid;
  });
  await measure("entrar de nuevo (caché)", () => Promise.all([loadFolders(provider), listMessages(provider, "INBOX", all, 1)]));
  await measure("cambiar de carpeta (Enviados)", () => listMessages(provider, "Sent", all, 1));
  await measure("paginar (pág. 2)", () => listMessages(provider, "INBOX", all, 2));
  await measure("buscar", () => listMessages(provider, "INBOX", parseFilters({ q: "Factura" }), 1));
  await measure("abrir mail", async () => preparedHtml(await openMessage(provider, "INBOX", firstUid), false));
  await measure("conversación (aparte)", async () => loadThread(provider, await loadFolders(provider), (await openMessage(provider, "INBOX", firstUid)).detail));
  await measure("abrir mail pesado (solo partes del cuerpo)", async () => preparedHtml(await openMessage(provider, "INBOX", heavyUid), false));
  await measure("adjunto (descarga completa)", async () => {
    const message = await openMessage(provider, "INBOX", heavyUid);
    const part = message.detail.attachments[0]?.part;
    if (!part) return;
    const reader = (await provider.openAttachment("INBOX", heavyUid, part)).stream.getReader();
    while (!(await reader.read()).done);
  });
  invalidateListings(provider);
  await measure("volver a entrar (conexión abierta, sin caché)", () => Promise.all([loadFolders(provider), listMessages(provider, "INBOX", all, 1)]));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
