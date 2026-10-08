import { requireUser } from "@/lib/auth";
import { getPeriods, getYear } from "@/lib/data";
import { Flash, flashFrom } from "@/components/Flash";
import { addPeriod, deletePeriod, savePeriods } from "@/app/actions/admin";

const KIND_LABEL: Record<string, string> = { cycle: "Cycle", eval: "Evaluation", sprint: "Sprint", survey: "Survey window", deadline: "Deadline" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner");
  const sp = await searchParams;
  const year = await getYear();
  const periods = await getPeriods(year.id);
  const unconfirmed = periods.filter((p) => !p.confirmed).length;
  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <div>
        <h1 className="h1">Calendar ({year.id})</h1>
        <p className="text-muted">
          Cycles, evaluations, sprints, survey windows, and deadlines. A goal shows &quot;Not yet measured&quot; until its period opens, and inputs are paced against the cycles or sprints
          that have closed.
        </p>
      </div>
      {unconfirmed > 0 && (
        <p className="card border-2 border-yellow bg-yellow-wash">
          <strong>{unconfirmed} dates are placeholders.</strong> They were estimated for SY26-27; replace them with the real calendar and tick &quot;Confirmed&quot;.
        </p>
      )}
      <form action={savePeriods} className="card overflow-x-auto p-0 sm:p-0">
        <input type="hidden" name="year" value={year.id} />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">Period</th>
              <th className="th">Kind</th>
              <th className="th">Opens</th>
              <th className="th">Closes</th>
              <th className="th">Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.key} className="border-b border-gray-brand/10">
                <td className="td font-semibold">{p.key}</td>
                <td className="td">{KIND_LABEL[p.kind]}</td>
                <td className="td">
                  <input type="date" name={`opens:${p.key}`} defaultValue={p.opens_on} className="input min-h-10 py-1" aria-label={`${p.key} opens`} />
                </td>
                <td className="td">
                  <input type="date" name={`closes:${p.key}`} defaultValue={p.closes_on} className="input min-h-10 py-1" aria-label={`${p.key} closes`} />
                </td>
                <td className="td">
                  <input type="checkbox" name={`confirmed:${p.key}`} defaultChecked={p.confirmed} className="h-5 w-5" aria-label={`${p.key} confirmed`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4">
          <button className="btn-primary">Save calendar</button>
        </div>
      </form>

      <form action={addPeriod} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
        <input type="hidden" name="year" value={year.id} />
        <h2 className="h3 sm:col-span-5">Add a period</h2>
        <label>
          <span className="label text-sm">Name</span>
          <input name="key" required className="input min-h-10 py-1" placeholder="C6" />
        </label>
        <label>
          <span className="label text-sm">Kind</span>
          <select name="kind" className="input min-h-10 py-1">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label text-sm">Opens</span>
          <input type="date" name="opens_on" required className="input min-h-10 py-1" />
        </label>
        <label>
          <span className="label text-sm">Closes</span>
          <input type="date" name="closes_on" className="input min-h-10 py-1" />
        </label>
        <button className="btn-small">Add</button>
      </form>

      <form action={deletePeriod} className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="year" value={year.id} />
        <label>
          <span className="label text-sm">Remove a period (only if nothing is saved for it)</span>
          <select name="key" className="input min-h-10 py-1">
            {periods.map((p) => (
              <option key={p.key}>{p.key}</option>
            ))}
          </select>
        </label>
        <button className="btn-danger">Remove</button>
      </form>
    </div>
  );
}
