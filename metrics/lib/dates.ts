/** Today's date (YYYY-MM-DD) in the program's time zone. */
export function todayISO(): string {
  const tz = process.env.APP_TIME_ZONE || "America/New_York";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const tz = process.env.APP_TIME_ZONE || "America/New_York";
  return new Date(d).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO.slice(0, 10)) - Date.parse(fromISO.slice(0, 10))) / 86_400_000);
}
