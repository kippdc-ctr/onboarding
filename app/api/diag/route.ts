import postgres from "postgres";
import { databaseUrl, cleanDatabaseUrl } from "@/lib/db";

// Temporary diagnostics: timings only, no data. Remove once the hang is fixed.
export const dynamic = "force-dynamic";

function client(opts: Record<string, unknown>) {
  return postgres(cleanDatabaseUrl(databaseUrl()!), {
    prepare: false,
    max: 1,
    onnotice: () => {},
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
    ...opts,
  } as never);
}

async function exp(name: string, opts: Record<string, unknown>, fn: (db: postgres.Sql) => Promise<unknown>, out: string[]) {
  const db = client(opts);
  const t = Date.now();
  try {
    await db`select 1`;
    const t2 = Date.now();
    await Promise.race([fn(db), new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 5000))]);
    out.push(`${name}: ok ${Date.now() - t2}ms`);
  } catch (e) {
    out.push(`${name}: FAIL ${(e as Error).message?.slice(0, 100)} ${Date.now() - t}ms`);
  }
  db.end({ timeout: 1 }).catch(() => {});
}

export async function GET() {
  const out: string[] = [];
  const P1 = { max_pipeline: 1 };
  const all = (db: postgres.Sql, n: number) => Promise.all(Array.from({ length: n }, (_, i) => db`select ${i}::int as n`));
  await exp("pipe1: 3 x select", P1, (db) => all(db, 3), out);
  await exp("pipe1: 5 x select", P1, (db) => all(db, 5), out);
  await exp("pipe1: 8 x select", P1, (db) => all(db, 8), out);
  await exp("pipe1: groups+modules", P1, (db) => Promise.all([db`select * from groups`, db`select * from modules`]), out);
  await exp("pipe1: settings+content_overrides", P1, (db) => Promise.all([db`select key, value from settings`, db`select * from content_overrides`]), out);
  await exp("pipe1: 4 config tables", P1, (db) => Promise.all([db`select * from groups`, db`select * from modules`, db`select * from phase_items`, db`select * from group_due_overrides`]), out);
  await exp("default pipeline: 8 x select", {}, (db) => all(db, 8), out);
  await exp("default pipeline: 4 config tables", {}, (db) => Promise.all([db`select * from groups`, db`select * from modules`, db`select * from phase_items`, db`select * from group_due_overrides`]), out);
  await exp("pipe1 max5: 8 x select", { ...P1, max: 5 }, (db) => all(db, 8), out);
  await exp("sequential 8", P1, async (db) => { for (let i = 0; i < 8; i++) await db`select ${i}::int`; }, out);
  return new Response(out.join("\n"), { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
