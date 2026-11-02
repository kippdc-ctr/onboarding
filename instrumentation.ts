// Runs once when the server starts. On an always-on host (Render), touch the database twice a day so a
// free Supabase project never sits idle long enough to pause. On Vercel, the daily cron in vercel.json does this.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.RENDER) return;
  const { sql } = await import("./lib/db");
  const ping = () => sql`select 1`.catch(() => {});
  setTimeout(ping, 60_000);
  setInterval(ping, 12 * 60 * 60 * 1000);
}
