import { sql } from "@/lib/db";
import { currentUser, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getYear } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Owner-only full archive of one school year (spec section 9: export and archive each year, then lock it). */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || u.must_change_password || !can.manageYear(u)) return new Response("Not allowed", { status: 403 });
  const year = await getYear(new URL(req.url).searchParams.get("year") ?? undefined);
  const goalIds = sql`select id from metrics.goals where school_year = ${year.id}`;
  const [goals, periods, residents, measurements, members, imports, changes] = await Promise.all([
    sql`select * from metrics.goals where school_year = ${year.id} order by number`,
    sql`select * from metrics.periods where school_year = ${year.id} order by sort_order`,
    sql`select * from metrics.residents where school_year = ${year.id} order by last_name, first_name`,
    sql`select * from metrics.measurements where goal_id in (${goalIds}) order by goal_id, period`,
    sql`select * from metrics.goal_members where goal_id in (${goalIds})`,
    sql`select * from metrics.imports where school_year = ${year.id} order by run_at`,
    sql`select * from metrics.goal_changes where goal_id in (${goalIds}) order by changed_at`,
  ]);
  await audit(u, "export", "year archive", { year: year.id });
  const body = JSON.stringify({ exported_at: new Date().toISOString(), year, goals, periods, residents, measurements, goal_members: members, imports, goal_changes: changes }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="ctr-metrics-${year.id}.json"`,
      "cache-control": "no-store",
    },
  });
}
