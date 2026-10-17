import { sql } from "@/lib/db";
import { explainDbError, missingSettings } from "@/lib/setup";
import { storageMode } from "@/lib/storage";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean; detail: string };

/** Public diagnostics page: names of missing settings and whether the database works. Never shows secret values. */
export default async function SetupCheck() {
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
  const allOk = checks.slice(0, 3).every((c) => c.ok);

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
        <p className="mt-4 text-sm text-muted">After changing settings in Vercel, redeploy, then reload this page.</p>
      </div>
    </main>
  );
}
