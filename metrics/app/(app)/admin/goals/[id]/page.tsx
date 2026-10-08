import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, getGoal, getPeriods, getSources, POPULATION_LABEL, TYPE_LABEL } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import { Flash, flashFrom } from "@/components/Flash";
import { saveGoal } from "@/app/actions/admin";

type Change = { id: number; changed_at: Date; changed_by: string; field: string; old_value: string | null; new_value: string | null; note: string | null };

export default async function EditGoal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner");
  const sp = await searchParams;
  const g = await getGoal(Number((await params).id));
  if (!g) notFound();
  const [periods, sources, changes] = await Promise.all([
    getPeriods(g.school_year),
    getSources(),
    sql<Change[]>`select * from metrics.goal_changes where goal_id = ${g.id} order by changed_at desc limit 100`,
  ]);

  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <nav className="text-sm">
        <Link href="/admin/goals" className="link">
          ← Goals
        </Link>{" "}
        ·{" "}
        <Link href={`/goals/${g.id}`} className="link">
          View on scorecard
        </Link>
      </nav>
      <h1 className="h1">{g.number === 0 ? "Big Goal" : `Goal ${g.number}`}</h1>

      <form action={saveGoal} className="card space-y-5">
        <input type="hidden" name="id" value={g.id} />
        <Field label="Goal text">
          <textarea name="text" defaultValue={g.text} rows={2} className="input" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category">
            <select name="category" defaultValue={g.category} className="input">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={g.type} className="input">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Population">
            <select name="population" defaultValue={g.population} className="input">
              {Object.entries(POPULATION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="grid gap-4 rounded-xl border border-gray-brand/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="px-1 font-bold">Target</legend>
          <Field label="Unit">
            <select name="unit" defaultValue={g.unit} className="input">
              <option value="percent">Percent</option>
              <option value="count">Count</option>
            </select>
          </Field>
          <Field label="Direction">
            <select name="direction" defaultValue={g.direction} className="input">
              <option value="at_least">At least (higher is better)</option>
              <option value="at_most">At most (fewer is better)</option>
            </select>
          </Field>
          <Field label="Target value">
            <input name="target_value" type="number" step="any" min={0} defaultValue={g.target_value} className="input" required />
          </Field>
          <Field label="Target as a count (note)">
            <input name="target_count_note" defaultValue={g.target_count_note ?? ""} className="input" placeholder="about 45 of 50 residents" />
          </Field>
          <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="target_confirmed" defaultChecked={g.target_confirmed} className="h-5 w-5" />
            <span>Target confirmed by Ashley</span>
          </label>
        </fieldset>

        <fieldset className="grid gap-4 rounded-xl border border-gray-brand/30 p-4 sm:grid-cols-2">
          <legend className="px-1 font-bold">Definition</legend>
          <Field label="Numerator (who counts as meeting it)">
            <textarea name="numerator_def" defaultValue={g.numerator_def} rows={3} className="input" />
          </Field>
          <Field label="Denominator (who is counted)">
            <textarea name="denominator_def" defaultValue={g.denominator_def} rows={3} className="input" />
          </Field>
          <Field label="Source">
            <select name="source" defaultValue={g.source} className="input">
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <input name="owner" defaultValue={g.owner} className="input" />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 rounded-xl border border-gray-brand/30 p-4 sm:grid-cols-3">
          <legend className="px-1 font-bold">When it is measured</legend>
          <Field label="Measurement period" help="Leave as “Each period” for goals measured every cycle or sprint (the latest one counts).">
            <select name="measured_at" defaultValue={g.measured_at ?? ""} className="input">
              <option value="">Each period (rolling)</option>
              {periods.map((p) => (
                <option key={p.key}>{p.key}</option>
              ))}
            </select>
          </Field>
          <Field label="Label shown on the scorecard">
            <input name="measured_label" defaultValue={g.measured_label} className="input" />
          </Field>
          <Field label="Pace against" help="For inputs: “on pace” compares to periods completed so far.">
            <select name="pace_by" defaultValue={g.pace_by ?? ""} className="input">
              <option value="">No pace</option>
              <option value="cycle">Cycles</option>
              <option value="sprint">Sprints</option>
            </select>
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 rounded-xl border border-gray-brand/30 p-4 sm:grid-cols-3">
          <legend className="px-1 font-bold">SY25-26 actual (baseline)</legend>
          <Field label="Value">
            <input name="baseline_value" type="number" step="any" defaultValue={g.baseline_value ?? ""} className="input" placeholder="blank = no baseline" />
          </Field>
          <Field label="n">
            <input name="baseline_n" defaultValue={g.baseline_n ?? ""} className="input" placeholder="38/50" />
          </Field>
          <Field label="Note">
            <input name="baseline_note" defaultValue={g.baseline_note ?? ""} className="input" />
          </Field>
        </fieldset>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="suppress_small_n" defaultChecked={g.suppress_small_n} className="h-5 w-5" />
            <span>Counts people: hide groups under 5 from non-owners</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="counts_withdrawn" defaultChecked={g.counts_withdrawn} className="h-5 w-5" />
            <span>Withdrawn residents stay in the denominator (retention goals)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={g.active} className="h-5 w-5" />
            <span>Active (shown on the scorecard)</span>
          </label>
        </div>
        {g.derive_rule && <p className="text-sm text-muted">This goal is calculated automatically from goal {g.derive_rule.from}&apos;s resident results.</p>}

        <Field label="Why the change? (saved in the change log)">
          <input name="change_note" className="input" placeholder="Optional" />
        </Field>
        <button className="btn-primary">Save goal</button>
      </form>

      <section className="card space-y-3" aria-labelledby="log">
        <h2 id="log" className="h3">
          Change log
        </h2>
        {changes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-brand/30">
                  <th className="th">When</th>
                  <th className="th">Who</th>
                  <th className="th">Field</th>
                  <th className="th">From</th>
                  <th className="th">To</th>
                  <th className="th">Note</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-brand/10 align-top">
                    <td className="td whitespace-nowrap">{fmtDateTime(c.changed_at)}</td>
                    <td className="td">{c.changed_by}</td>
                    <td className="td">{c.field}</td>
                    <td className="td text-muted">{c.old_value}</td>
                    <td className="td">{c.new_value}</td>
                    <td className="td">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No changes since the goals were seeded from the SY26-27 Program Goals document.</p>
        )}
      </section>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label text-sm">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}
