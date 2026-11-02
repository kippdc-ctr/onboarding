import { sql } from "@/lib/db";
import { explainDbError, missingSettings } from "@/lib/setup";
import { storageMode } from "@/lib/storage";
import { getConfig } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { loadCohort } from "@/lib/cohort";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean; detail: string };

/** Public diagnostics page: names of missing settings and whether the database works. Never shows secret values. */
async function timed<T>(label: string, fn: () => Promise<T>, ms = 15_000): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: unknown; ms: number }> {
  const t = Date.now();
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${label} took longer than ${ms / 1000}s`), { code: "TIMEOUT" })), ms))]);
    return { ok: true, value, ms: Date.now() - t };
  } catch (error) {
    return { ok: false, error, ms: Date.now() - t };
  }
}

/** ?deep=1: database size, whether saves work, and how long the admin page's data takes. Sizes and timings only. */
async function deepChecks(): Promise<Check[]> {
  const out: Check[] = [];
  const size = await timed("Database size", () => sql<{ db: string; bytes: number }[]>`select pg_size_pretty(pg_database_size(current_database())) as db, pg_database_size(current_database())::float8 as bytes`);
  if (size.ok) {
    const [{ db, bytes }] = size.value;
    const big = await sql<{ t: string; s: string }[]>`
      select relname as t, pg_size_pretty(pg_total_relation_size(relid)) as s from pg_catalog.pg_statio_user_tables
      order by pg_total_relation_size(relid) desc limit 5`;
    const pct = Math.round((100 * bytes) / (500 * 1024 * 1024));
    out.push({
      label: "Database space (free plan limit 500 MB)",
      ok: pct < 90,
      detail: `${db} used (${pct}%). Largest tables: ${big.map((x) => `${x.t} ${x.s}`).join(", ")}.${pct >= 100 ? " The database is over the limit, so Supabase makes it read-only." : ""}`,
    });
  } else out.push({ label: "Database space", ok: false, detail: explainDbError(size.error).hint });

  const write = await timed("Save test", () => sql`update settings set value = value where key = 'contact_email'`);
  out.push({
    label: "Saving works",
    ok: write.ok,
    detail: write.ok
      ? `Yes (${write.ms} ms).`
      : /read-only/i.test(String((write.error as Error)?.message)) ? "No: the database is read-only, usually because it is over the 500 MB free limit." : `${explainDbError(write.error).hint} (${write.ms} ms)`,
  });

  const cfg = await timed("Loading settings and content", () => getConfig(todayISO()));
  out.push({ label: "Loading settings and module content", ok: cfg.ok, detail: cfg.ok ? `${cfg.ms} ms` : `${explainDbError(cfg.error).hint} (${cfg.ms} ms)` });
  const cohort = await timed("Loading the completion grid", () => loadCohort({}));
  out.push({
    label: "Loading the admin completion grid",
    ok: cohort.ok && cohort.ms < 8000,
    detail: cohort.ok ? `${cohort.value.rows.length} residents in ${cohort.ms} ms${cohort.ms >= 8000 ? " (too slow)" : ""}` : `${explainDbError(cohort.error).hint} (${cohort.ms} ms)`,
  });
  return out;
}

export default async function SetupCheck({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const deep = (await searchParams).deep === "1";
  const checks: Check[] = [];
  const missing = missingSettings();
  checks.push({
    label: "Required settings",
    ok: missing.length === 0,
    detail: missing.length ? `Missing: ${missing.map((m) => m.name).join(", ")}` : "All present.",
  });
  try {
    await sql`select 1`;
    checks.push({ label: "Database connection", ok: true, detail: "Connected." });
    try {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from settings`;
      const [{ r }] = await sql<{ r: number }[]>`select count(*)::int as r from residents`;
      await sql`select 1 from content_overrides limit 1`;
      checks.push({ label: "Database tables", ok: n > 0, detail: n > 0 ? `Set up (${r} resident${r === 1 ? "" : "s"} on the roster).` : "Tables exist but weren't seeded. Redeploy." });
    } catch (e) {
      const x = explainDbError(e);
      checks.push({ label: "Database tables", ok: false, detail: `${x.hint} (code ${x.code})` });
    }
  } catch (e) {
    const x = explainDbError(e);
    checks.push({ label: "Database connection", ok: false, detail: `${x.hint} (code ${x.code})` });
  }
  const sm = storageMode();
  checks.push({
    label: "Audio uploads (optional)",
    ok: sm !== "none",
    detail: sm === "supabase" ? "Supabase Storage is configured." : sm === "local" ? "Local development folder." : "Not set up: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing. Pasting audio links still works.",
  });
  if (deep && checks[1]?.ok) checks.push(...(await deepChecks()));
  const allOk = checks.filter((c) => !c.label.startsWith("Audio")).every((c) => c.ok);

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <Logo />
      <div className="card mt-8">
        <h1 className="h2">Setup check</h1>
        <p className={`mt-2 font-semibold ${allOk ? "text-teal-ink" : "text-coral-ink"}`}>{allOk ? "✓ Everything needed is working." : "Something needs attention:"}</p>
        <ul className="mt-4 space-y-3">
          {checks.map((c) => (
            <li key={c.label} className={`rounded-xl border-2 p-3 ${c.ok ? "border-teal bg-teal-wash" : "border-coral bg-coral-wash"}`}>
              <p className="font-bold">
                {c.ok ? "✓" : "✗"} {c.label}
              </p>
              <p>{c.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          After changing settings in Vercel, redeploy, then reload this page.{" "}
          {!deep && (
            <a href="/setup-check?deep=1" className="link">
              Run the deeper check
            </a>
          )}
        </p>
      </div>
    </main>
  );
}
