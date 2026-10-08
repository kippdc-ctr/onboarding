import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getYear, listYears } from "@/lib/data";
import { fmtDate } from "@/lib/dates";
import { Flash, flashFrom } from "@/components/Flash";
import { deleteYear, loadSamples, removeSamples, setCurrentYear, setYearLocked, startNewYear } from "@/app/actions/admin";

export default async function YearsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner");
  const sp = await searchParams;
  const [years, current] = await Promise.all([listYears(), getYear()]);
  const [{ samples }] = await sql<{ samples: number }[]>`select count(*)::int as samples from metrics.residents where school_year = ${current.id} and is_sample`;
  const nextStart = `${Number(current.start_date.slice(0, 4)) + 1}${current.start_date.slice(4)}`;
  const nextEnd = `${Number(current.end_date.slice(0, 4)) + 1}${current.end_date.slice(4)}`;
  const nextId = current.id.replace(/SY(\d{2})-(\d{2})/, (_, a, b) => `SY${Number(a) + 1}-${Number(b) + 1}`);

  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <h1 className="h1">School years &amp; data</h1>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">Year</th>
              <th className="th">Dates</th>
              <th className="th">State</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id} className="border-b border-gray-brand/10 align-top">
                <td className="td font-bold">{y.id}</td>
                <td className="td">
                  {fmtDate(y.start_date)} to {fmtDate(y.end_date)}
                </td>
                <td className="td">
                  {y.is_current && <span className="chip mr-1 border-teal bg-teal-wash text-teal-ink">Current</span>}
                  {y.locked && <span className="chip border-gray-brand text-muted">Locked</span>}
                </td>
                <td className="td">
                  <div className="flex flex-wrap gap-2">
                    <a href={`/export/year?year=${encodeURIComponent(y.id)}`} className="btn-small">
                      Download archive (JSON)
                    </a>
                    <form action={setYearLocked}>
                      <input type="hidden" name="year" value={y.id} />
                      <input type="hidden" name="locked" value={y.locked ? "false" : "true"} />
                      <button className="btn-small">{y.locked ? "Unlock" : "Lock"}</button>
                    </form>
                    {!y.is_current && (
                      <form action={setCurrentYear}>
                        <input type="hidden" name="year" value={y.id} />
                        <button className="btn-small">Make current</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">At the end of each year: download the archive, then lock the year. A locked year can be viewed but not changed.</p>

      <form action={startNewYear} className="card grid gap-3 sm:grid-cols-4 sm:items-end">
        <h2 className="h3 sm:col-span-4">Start a new school year</h2>
        <p className="text-sm text-muted sm:col-span-4">
          Copies {current.id}&apos;s goals (with this year&apos;s results as next year&apos;s baselines) and calendar (shifted to the new start date, marked unconfirmed). The roster and
          results are not copied.
        </p>
        <input type="hidden" name="from" value={current.id} />
        <label>
          <span className="label text-sm">Name</span>
          <input name="id" defaultValue={nextId} className="input min-h-10 py-1" />
        </label>
        <label>
          <span className="label text-sm">Starts</span>
          <input name="start_date" type="date" defaultValue={nextStart} className="input min-h-10 py-1" />
        </label>
        <label>
          <span className="label text-sm">Ends</span>
          <input name="end_date" type="date" defaultValue={nextEnd} className="input min-h-10 py-1" />
        </label>
        <button className="btn-small">Create</button>
      </form>

      <section className="card space-y-3">
        <h2 className="h3">Sample data ({current.id})</h2>
        <p className="text-sm text-muted">
          67 clearly fake residents (&quot;Sample01&quot;…) with sample results for a few goals, to try the screens before real imports. Delete before using real data.
        </p>
        <div className="flex flex-wrap gap-2">
          {samples ? (
            <form action={removeSamples}>
              <button className="btn-danger">Delete sample data ({samples} residents)</button>
            </form>
          ) : (
            <form action={loadSamples}>
              <button className="btn-small">Load sample data</button>
            </form>
          )}
        </div>
      </section>

      <form action={deleteYear} className="card space-y-3 border-2 border-coral">
        <h2 className="h3 text-coral-ink">Delete a school year</h2>
        <p className="text-sm">Permanently deletes the year&apos;s goals, calendar, roster, results, and import history. Download the archive first. The current year can&apos;t be deleted.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label text-sm">Year</span>
            <select name="year" className="input min-h-10 py-1">
              {years.map((y) => (
                <option key={y.id}>{y.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label text-sm">Type DELETE and the year (e.g. DELETE SY25-26)</span>
            <input name="confirm" className="input min-h-10 py-1" autoComplete="off" />
          </label>
          <button className="btn-danger">Delete year</button>
        </div>
      </form>
    </div>
  );
}
