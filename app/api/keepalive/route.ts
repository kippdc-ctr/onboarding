import { sql } from "@/lib/db";

// Called once a day by a Vercel cron job (vercel.json). Free Supabase projects pause after
// about a week with no database activity; this tiny query keeps the project awake.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`select count(*) from settings`;
    return Response.json({ ok: true, at: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
