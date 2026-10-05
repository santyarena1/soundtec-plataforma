import { APP_TIME_ZONE } from "@/lib/utils";

/** Argentina no tiene horario de verano: siempre UTC-3. */
const AR_OFFSET = "-03:00";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO → "YYYY-MM-DDTHH:mm" en hora de Buenos Aires (igual en server y cliente). */
export function toArgentinaInput(iso: string): string {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Valor de datetime-local tipeado en hora argentina → ISO UTC; null si es inválido. */
export function argentinaInputToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const date = new Date(`${withSeconds}${AR_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
