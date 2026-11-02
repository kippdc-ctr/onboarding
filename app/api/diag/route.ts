import { sql } from "@/lib/db";
import { getConfig, getResolvedContent, loadBundles } from "@/lib/data";
import { loadCohort } from "@/lib/cohort";
import { todayISO } from "@/lib/dates";

// Temporary diagnostics: timings only, no data. Remove once the hang is fixed.
export const dynamic = "force-dynamic";

async function step(name: string, fn: () => Promise<unknown>, out: string[]) {
  const t = Date.now();
  try {
    await fn();
    out.push(`${name}: ok ${Date.now() - t}ms`);
  } catch (e) {
    out.push(`${name}: FAIL ${(e as Error).message?.slice(0, 120)} ${Date.now() - t}ms`);
  }
}

export async function GET() {
  const out: string[] = [];
  await step("4 tables at once", () => Promise.all([sql`select * from groups`, sql`select * from modules`, sql`select * from phase_items`, sql`select * from settings`]), out);
  await step("content", () => getResolvedContent(), out);
  await step("getConfig", () => getConfig(todayISO()), out);
  await step("bundles", async () => loadBundles((await sql<{ id: string }[]>`select id from residents`).map((r) => r.id)), out);
  await step("admin grid", () => loadCohort({}), out);
  await step("select 1 after", () => sql`select 1`, out);
  return new Response(out.join("\n"), { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
