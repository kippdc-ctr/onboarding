import { sql } from "@/lib/db";
import { deleteCohort, deleteSampleData } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function DataPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from residents where is_sample`;
  const cohorts = await sql<{ cohort_year: number; n: number }[]>`select cohort_year, count(*)::int as n from residents where not is_sample group by cohort_year order by cohort_year`;
  return (
    <div className="space-y-6">
      <h1 className="h1">Data</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <section className="card space-y-3">
        <h2 className="h2">Sample data</h2>
        <p>
          There {n === 1 ? "is" : "are"} <strong>{n}</strong> sample resident{n === 1 ? "" : "s"} for testing. Delete them before the real launch.
        </p>
        <form action={deleteSampleData}>
          <button className="btn-danger" disabled={n === 0}>
            Delete sample data
          </button>
        </form>
      </section>
      <section className="card space-y-3">
        <h2 className="h2">Export everything</h2>
        <p>A full JSON backup of every table (PINs are left out). Do this before deleting a cohort.</p>
        <a className="btn-small" href="/admin/export/all">
          Download full backup (JSON)
        </a>
      </section>
      <section className="card space-y-3">
        <h2 className="h2">Delete a cohort (end of year)</h2>
        <p>Permanently deletes every resident in that cohort and all their answers, reflections, and survey responses. This can&apos;t be undone.</p>
        <ul className="list-disc pl-6">
          {cohorts.map((c) => (
            <li key={c.cohort_year}>
              Cohort {c.cohort_year}: {c.n} residents
            </li>
          ))}
        </ul>
        <form action={deleteCohort} className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label">Cohort year</span>
            <select name="cohort_year" className="input w-36">
              {cohorts.map((c) => (
                <option key={c.cohort_year}>{c.cohort_year}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Type DELETE and the year to confirm</span>
            <input name="confirm" className="input w-56" placeholder="DELETE 2028" autoComplete="off" />
          </label>
          <button className="btn-danger" disabled={!cohorts.length}>
            Delete cohort
          </button>
        </form>
      </section>
    </div>
  );
}
