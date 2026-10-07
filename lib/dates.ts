// All due dates are calendar dates ('YYYY-MM-DD'). "Today" is computed in the app's time zone.
export const TIME_ZONE = process.env.APP_TIME_ZONE || "America/New_York";

export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: opts.weekday ? "short" : undefined,
    month: "long",
    day: "numeric",
    year: opts.year === false ? undefined : "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function isPast(dueIso: string | null | undefined, today: string): boolean {
  return !!dueIso && today > dueIso;
}
