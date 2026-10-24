import { APP_TIME_ZONE } from "@/lib/utils";

/**
 * «act. 15/10/26 23:16» en hora de Argentina. Se arma a mano con formatToParts:
 * toLocaleString daba un texto distinto en el servidor y en el navegador
 * (zona horaria y espacio de «p. m.»), y React rehacía toda la página.
 */
export function formatFieldStamp(at: string): string | null {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function FieldStamp({ at }: { at?: string }) {
  if (!at) return null;
  const formatted = formatFieldStamp(at);
  if (!formatted) return null;
  return <span className="mt-0.5 block text-[10px] leading-tight text-gray-400">act. {formatted}</span>;
}
