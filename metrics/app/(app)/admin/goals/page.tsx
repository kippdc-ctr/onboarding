import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, getGoals, getYear, TYPE_LABEL } from "@/lib/data";
import { formatTarget, formatValue } from "@/lib/status";
import { Flash, flashFrom } from "@/components/Flash";
import { addGoal, confirmAllTargets } from "@/app/actions/admin";

export default async function GoalsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner");
  const sp = await searchParams;
  const year = await getYear();
  const goals = await getGoals(year.id, { includeInactive: true });
  const unconfirmed = goals.filter((g) => !g.target_confirmed).length;
  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <div>
        <h1 className="h1">Goals ({year.id})</h1>
        <p className="text-muted">Edit targets, definitions, and measurement windows. Every change is kept in the goal&apos;s change log.</p>
      </div>
      {unconfirmed > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-2 border-yellow bg-yellow-wash">
          <p>
            <strong>{unconfirmed} targets are marked &quot;to confirm&quot;.</strong> Some first digits were hard to read in the goals PDF export. Check each one (open a goal to edit it), then confirm.
          </p>
          <form action={confirmAllTargets}>
            <button className="btn-small">Mark all targets confirmed</button>
          </form>
        </div>
      )}
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">#</th>
              <th className="th">Goal</th>
              <th className="th">Type</th>
              <th className="th">Target</th>
              <th className="th">SY25-26</th>
              <th className="th">Measured at</th>
              <th className="th">Source</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.id} className={`border-b border-gray-brand/10 ${g.active ? "" : "opacity-60"}`}>
                <td className="td font-bold">{g.number === 0 ? "Big" : g.number}</td>
                <td className="td">
                  <Link href={`/admin/goals/${g.id}`} className="link">
                    {g.text}
                  </Link>
                  {!g.active && <span className="ml-1 text-xs font-bold text-muted">inactive</span>}
                </td>
                <td className="td whitespace-nowrap">{TYPE_LABEL[g.type]}</td>
                <td className="td whitespace-nowrap">
                  {formatTarget(g)} {!g.target_confirmed && <span className="text-xs font-semibold text-coral-ink">to confirm</span>}
                </td>
                <td className="td">{g.baseline_value === null ? "—" : formatValue(g.unit, g.baseline_value)}</td>
                <td className="td">{g.measured_label}</td>
                <td className="td">{g.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={addGoal} className="card grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
        <label>
          <span className="label">New goal</span>
          <input name="text" className="input" placeholder="Goal text" required />
        </label>
        <label>
          <span className="label">Category</span>
          <select name="category" className="input" required>
            {CATEGORIES.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="btn-small">Add goal</button>
      </form>
    </div>
  );
}
