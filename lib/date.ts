export const APP_TIME_ZONE = "America/Santo_Domingo";

export function dateKeyInTimeZone(value: Date | string = new Date(), timeZone = APP_TIME_ZONE) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateOnlyDistance(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function isEventOngoing(event: {starts_at: string; ends_at?: string | null}, now = Date.now()) {
  const start = Date.parse(event.starts_at);
  const end = event.ends_at ? Date.parse(event.ends_at) : start + 60 * 60_000;
  return now >= start && now < end;
}
