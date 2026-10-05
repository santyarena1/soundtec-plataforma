export type ExpoEventStatus = "SCHEDULED" | "LIVE" | "ENDED";

export const EVENT_STATUS_LABEL: Record<ExpoEventStatus, string> = {
  SCHEDULED: "PROGRAMADO",
  LIVE: "VIGENTE",
  ENDED: "TERMINADO",
};

export function eventStatus(event: { startsAt: Date; endsAt: Date }, now: Date = new Date()): ExpoEventStatus {
  if (now < event.startsAt) return "SCHEDULED";
  if (now > event.endsAt) return "ENDED";
  return "LIVE";
}
