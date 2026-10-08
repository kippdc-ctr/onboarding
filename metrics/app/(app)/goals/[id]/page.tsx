import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { campusScope, can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getGoal, getMeasurements, getPeriods, getSettings, getSources, getYear, Measurement, POPULATION_LABEL, Resident, residentName, scoreGoals } from "@/lib/data";
import { BREAKDOWN_LABEL, BreakdownType, DEMOGRAPHIC_BREAKDOWNS, ROSTER_BREAKDOWNS, suppressed } from "@/lib/compute";
import { formatTarget, formatValue, valueOf } from "@/lib/status";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { ChangeArrow, StatusChip, TypeChip } from "@/components/Chips";
import { Value } from "@/components/Value";
import { TrendChart } from "@/components/TrendChart";
import { Flash, flashFrom } from "@/components/Flash";
import { deleteMeasurementPeriod, saveManualMeasurement } from "@/app/actions/measurements";

type SP = Record<string, string | string[] | undefined>;

type MemberRow = { resident_id: string; counted: boolean; met: boolean; raw_value: string | null; reason: string | null } & Pick<
  Resident,
  "first_name" | "last_name" | "preferred_name" | "campus" | "school" | "grade_band" | "status"
>;

export default async function GoalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const goal = await getGoal(Number((await params).id));
  if (!goal) notFound();
  const year = await getYear(goal.school_year);
  const [[scored], periods, settings, sources, allMs] = await Promise.all([
    scoreGoals(year, [goal]),
    getPeriods(year.id),
    getSettings(),
    getSources(),
    getMeasurements([goal.id], "any"),
  ]);
  const { ev } = scored;
  const isOwner = can.seeSmallN(u);
  const supOpts = { suppressSmallN: goal.suppress_small_n, isOwner, smallN: settings.smallN };
  const overall = allMs.filter((m) => m.breakdown_type === "all");
  const order = new Map(periods.map((p) => [p.key, p.sort_order]));
  overall.sort((a, b) => (order.get(a.period) ?? 0) - (order.get(b.period) ?? 0));

  // Which period's breakdowns and residents to show: ?period=, else the one the status is based on, else the latest.
  const chosen = (typeof sp.period === "string" && overall.some((m) => m.period === sp.period) ? sp.period : null) ?? ev.current?.period ?? ev.interim?.period ?? overall.at(-1)?.period ?? null;
  const breakdownTypes: BreakdownType[] = [...ROSTER_BREAKDOWNS, ...(can.viewDemographicBreakdowns(u) ? DEMOGRAPHIC_BREAKDOWNS : [])];
  const breakdowns = allMs.filter((m) => m.period === chosen && m.breakdown_type !== "all" && breakdownTypes.includes(m.breakdown_type));
  const scope = campusScope(u);
  // RDLs see only their own campus row in breakdowns.
  const visibleBreakdowns = scope ? breakdowns.filter((m) => m.breakdown_type === "campus" && m.breakdown_value === scope) : breakdowns;

  // A list of residents in a demographic subset (goal 32) would reveal each person's demographics: owner only.
  const demographicGoal = !!goal.derive_rule;
  const members = chosen && (!demographicGoal || can.viewDemographics(u))
    ? await sql<MemberRow[]>`
        select gm.resident_id, gm.counted, gm.met, gm.raw_value, gm.reason,
               r.first_name, r.last_name, r.preferred_name, r.campus, r.school, r.grade_band, r.status
        from metrics.goal_members gm join metrics.residents r on r.id = gm.resident_id
        where gm.goal_id = ${goal.id} and gm.period = ${chosen} ${scope ? sql`and r.campus = ${scope}` : sql``}
        order by r.last_name, r.first_name`
    : [];
  if (members.length) await audit(u, "view_members", `goal ${goal.number}`, { period: chosen, count: members.length });
  const missing = members.filter((m) => m.counted && !m.met);
  const notCounted = members.filter((m) => !m.counted);
  const met = members.filter((m) => m.counted && m.met);

  // Goal 33: name the demographic groups below the overall rate (owner and CTR team only).
  let gapGroups: { label: string; rate: number; overall: number }[] | null = null;
  const rule = goal.derive_rule;
  if (rule?.kind === "gap" && chosen && can.viewDemographicBreakdowns(u)) {
    const src = await sql<Measurement[]>`
      select m.* from metrics.measurements m join metrics.goals g on g.id = m.goal_id
      where g.school_year = ${goal.school_year} and g.number = ${rule.from} and g.visibility = 'shared' and m.period = ${chosen}`;
    const all = src.find((m) => m.breakdown_type === "all");
    if (all?.denominator) {
      const overallRate = (all.numerator / all.denominator) * 100;
      gapGroups = src
        .filter((m) => (rule.by as string[]).includes(m.breakdown_type) && m.denominator !== null && m.denominator >= settings.smallN)
        .map((m) => ({ label: `${BREAKDOWN_LABEL[m.breakdown_type]}: ${m.breakdown_value}`, rate: (m.numerator / m.denominator!) * 100, overall: overallRate }))
        .filter((x) => x.overall - x.rate > rule.points);
    }
  }

  const imports = await sql<{ id: number; file_name: string | null; run_by: string; run_at: Date; kind: string }[]>`
    select id, file_name, run_by, run_at, kind from metrics.imports where id = any(${allMs.map((m) => m.source_import_id).filter((x): x is number => x !== null)})`;
  const importById = new Map(imports.map((i) => [i.id, i]));
  const sourceLabel = sources.find((s) => s.key === goal.source)?.label ?? goal.source;
  const canEnter = can.enterMeasurements(u) && !year.locked && !goal.derive_rule;
  const showTrend = overall.length > 0;
  const cur = ev.current;

  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <nav className="text-sm">
        <Link href="/" className="link">
          ← Scorecard
        </Link>
        <span className="text-muted"> · {goal.category}</span>
      </nav>

      <header className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-muted">{goal.number === 0 ? "Big Goal" : `Goal ${goal.number}`}</p>
            <h1 className="text-2xl font-bold text-ink">{goal.text}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <TypeChip type={goal.type} />
              <span>{POPULATION_LABEL[goal.population] ?? goal.population}</span>
              <span>· Measured at: {goal.measured_label}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {cur ? (
              <Value
                unit={goal.unit}
                numerator={ev.pace ? ev.pace.actual : cur.numerator}
                denominator={ev.pace ? null : cur.denominator}
                suppressed={suppressed(cur.denominator, supOpts)}
                smallGroup={isOwner && goal.suppress_small_n && cur.denominator !== null && cur.denominator < settings.smallN}
                big
              />
            ) : (
              <span className="text-xl font-bold text-muted">—</span>
            )}
            <StatusChip status={ev.status} label={ev.pace && ev.status === "met" && ev.pace.periodsDone < ev.pace.periodsTotal ? "On pace" : undefined} />
            <span className="text-sm text-muted">
              Target <strong className="text-ink">{formatTarget(goal)}</strong>
              {cur ? ` · data through ${fmtDate(cur.data_through)}` : ev.status === "not_yet" && ev.windowOpens ? ` · window opens ${fmtDate(ev.windowOpens)}` : ""}
            </span>
          </div>
        </div>
        {ev.pace && (
          <p className="rounded-xl bg-teal-wash p-3 text-sm">
            Pace: {ev.pace.actual} delivered; {ev.pace.expected} expected after {ev.pace.periodsDone} of {ev.pace.periodsTotal} {goal.pace_by}s.
          </p>
        )}
        {!cur && ev.interim && (
          <p className="rounded-xl bg-yellow-wash p-3 text-sm">
            Interim result from {ev.interim.period}:{" "}
            <strong>{suppressed(ev.interim.denominator, supOpts) ? "n < 5" : formatValue(goal.unit, valueOf(goal.unit, ev.interim))}</strong>. The status waits for {goal.measured_label}.
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3" aria-labelledby="def">
          <h2 id="def" className="h3">
            How it is calculated
          </h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="font-bold text-muted">Numerator</dt>
            <dd>{goal.numerator_def || "—"}</dd>
            <dt className="font-bold text-muted">Denominator</dt>
            <dd>{goal.denominator_def || "—"}</dd>
            <dt className="font-bold text-muted">Source</dt>
            <dd>{sourceLabel}</dd>
            <dt className="font-bold text-muted">Measured at</dt>
            <dd>{goal.measured_label}</dd>
            <dt className="font-bold text-muted">Target</dt>
            <dd>
              {formatTarget(goal)}
              {goal.target_count_note && <span className="text-muted"> ({goal.target_count_note})</span>}
              {!goal.target_confirmed && <span className="ml-1 font-semibold text-coral-ink">· to confirm</span>}
            </dd>
            <dt className="font-bold text-muted">SY25-26 actual</dt>
            <dd>
              {goal.baseline_value === null ? "No baseline" : formatValue(goal.unit, goal.baseline_value)}
              {goal.baseline_n && <span className="text-muted"> ({goal.baseline_n})</span>}
              {goal.baseline_note && <span className="text-muted"> · {goal.baseline_note}</span>}
              {cur && !suppressed(cur.denominator, supOpts) && (
                <span className="ml-2">
                  <ChangeArrow change={ev.change} fewerIsBetter={goal.direction === "at_most"} />
                </span>
              )}
            </dd>
            {goal.doc_change && (
              <>
                <dt className="font-bold text-muted">Goals doc</dt>
                <dd>Change column: {goal.doc_change}</dd>
              </>
            )}
            <dt className="font-bold text-muted">Owner</dt>
            <dd>{goal.owner}</dd>
            {goal.counts_withdrawn && (
              <>
                <dt className="font-bold text-muted">Withdrawn</dt>
                <dd>Withdrawn residents stay in the denominator (retention goal).</dd>
              </>
            )}
          </dl>
          {u.role === "owner" && (
            <Link href={`/admin/goals/${goal.id}`} className="btn-small">
              Edit goal
            </Link>
          )}
        </section>

        <section className="card space-y-3" aria-labelledby="trend">
          <h2 id="trend" className="h3">
            Trend
          </h2>
          {showTrend ? (
            <TrendChart
              title={`Goal ${goal.number}`}
              unit={goal.unit}
              target={Number(goal.target_value)}
              points={overall.map((m) => {
                const hide = suppressed(m.denominator, supOpts);
                const v = hide ? null : valueOf(goal.unit, m);
                return { period: m.period, value: v, label: hide ? "n < 5" : formatValue(goal.unit, v) };
              })}
            />
          ) : (
            <p className="text-muted">No numbers yet.</p>
          )}
        </section>
      </div>

      <section className="card space-y-4" aria-labelledby="breakdowns">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="breakdowns" className="h3">
            Breakdowns{chosen ? `: ${chosen}` : ""}
          </h2>
          {overall.length > 1 && (
            <form className="flex items-center gap-2">
              <label htmlFor="period" className="text-sm font-semibold">
                Period
              </label>
              <select id="period" name="period" defaultValue={chosen ?? ""} className="input min-h-10 w-auto py-1">
                {overall.map((m) => (
                  <option key={m.period}>{m.period}</option>
                ))}
              </select>
              <button className="btn-small">Show</button>
            </form>
          )}
        </div>
        {gapGroups && (
          <div className="rounded-xl border-2 border-coral bg-coral-wash p-3 text-sm">
            <p className="font-bold text-coral-ink">
              Groups more than {rule?.kind === "gap" ? rule.points : 10} points below the overall rate (demographic: do not share)
            </p>
            {gapGroups.length ? (
              <ul className="mt-1 list-disc pl-5">
                {gapGroups.map((x) => (
                  <li key={x.label}>
                    {x.label}: {Math.round(x.rate)}% vs {Math.round(x.overall)}% overall
                  </li>
                ))}
              </ul>
            ) : (
              <p>None.</p>
            )}
          </div>
        )}
        {visibleBreakdowns.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {breakdownTypes.map((bt) => {
              const rows = visibleBreakdowns.filter((m) => m.breakdown_type === bt);
              if (!rows.length) return null;
              return (
                <div key={bt}>
                  <h3 className="mb-1 font-bold">
                    {BREAKDOWN_LABEL[bt]}
                    {DEMOGRAPHIC_BREAKDOWNS.includes(bt as never) && <span className="ml-2 text-xs font-semibold text-coral-ink">demographic: do not share</span>}
                  </h3>
                  <BreakdownTable rows={rows} goalUnit={goal.unit} target={Number(goal.target_value)} supOpts={supOpts} smallN={settings.smallN} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">
            {gapGroups && rule ? `See goal ${rule.from} for every group's rate.` : goal.type === "perception" ? "Survey goals show breakdowns only when they're imported as aggregate rows." : "No breakdowns for this period yet."}
          </p>
        )}
        {isOwner && visibleBreakdowns.some((m) => m.denominator !== null && m.denominator < settings.smallN) && goal.suppress_small_n && (
          <p className="rounded-xl border-2 border-coral bg-coral-wash p-3 text-sm font-semibold text-coral-ink">
            Some groups have fewer than {settings.smallN} people. Others see &quot;n &lt; {settings.smallN}&quot;. Don&apos;t screenshot or share these.
          </p>
        )}
      </section>

      {members.length > 0 && (
        <section className="card space-y-4" aria-labelledby="missing">
          <h2 id="missing" className="h3">
            Who is missing this goal{chosen ? ` (${chosen})` : ""}
            {scope && <span className="text-base font-normal text-muted"> · {scope} only</span>}
          </h2>
          <MemberList title={`Not meeting the goal (${missing.length})`} rows={missing} emphasis />
          <MemberList title={`Not counted (${notCounted.length})`} rows={notCounted} showReason />
          <details>
            <summary className="cursor-pointer font-semibold text-teal-ink">Meeting the goal ({met.length})</summary>
            <MemberList title="" rows={met} />
          </details>
        </section>
      )}

      <section className="card space-y-3" aria-labelledby="history">
        <h2 id="history" className="h3">
          Numbers by period
        </h2>
        {overall.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-brand/30">
                  <th className="th">Period</th>
                  <th className="th">Value</th>
                  <th className="th">Data through</th>
                  <th className="th">Entered</th>
                  <th className="th">Note</th>
                  {canEnter && <th className="th">
                    <span className="sr-only">Actions</span>
                  </th>}
                </tr>
              </thead>
              <tbody>
                {overall.map((m) => {
                  const imp = m.source_import_id ? importById.get(m.source_import_id) : undefined;
                  return (
                    <tr key={m.id} className="border-b border-gray-brand/10">
                      <td className="td font-semibold">{m.period}</td>
                      <td className="td">
                        <Value unit={goal.unit} numerator={m.numerator} denominator={m.denominator} suppressed={suppressed(m.denominator, supOpts)} />
                      </td>
                      <td className="td">{fmtDate(m.data_through)}</td>
                      <td className="td text-muted">
                        {imp && u.role !== "rdl" ? `${imp.kind === "manual" ? "Typed in" : imp.file_name || "Import"} · ${imp.run_by} · ${fmtDateTime(imp.run_at)}` : "—"}
                      </td>
                      <td className="td">{m.note}</td>
                      {canEnter && (
                        <td className="td">
                          <form action={deleteMeasurementPeriod}>
                            <input type="hidden" name="goal_id" value={goal.id} />
                            <input type="hidden" name="period" value={m.period} />
                            <button className="link text-sm text-coral-ink" type="submit">
                              Delete
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">Nothing imported or entered yet.</p>
        )}
        {goal.derive_rule && <p className="text-sm text-muted">Calculated automatically whenever goal {goal.derive_rule.from}&apos;s resident results are imported.</p>}
      </section>

      {canEnter && (
        <section className="card space-y-3" aria-labelledby="enter">
          <h2 id="enter" className="h3">
            Enter a number by hand
          </h2>
          <p className="text-sm text-muted">Replaces anything already saved for that period (including resident-level results). For a file, use Import.</p>
          <form action={saveManualMeasurement} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="goal_id" value={goal.id} />
            <label>
              <span className="label">Period</span>
              <select name="period" className="input" defaultValue={goal.measured_at ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {periods.map((p) => (
                  <option key={p.key}>{p.key}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{goal.unit === "count" ? "Count" : "Numerator"}</span>
              <input name="numerator" type="number" min={0} step="any" required className="input" />
            </label>
            <label>
              <span className="label">Denominator{goal.unit === "count" && " (optional)"}</span>
              <input name="denominator" type="number" min={0} step="any" required={goal.unit === "percent"} className="input" />
            </label>
            <label>
              <span className="label">Data through</span>
              <input name="data_through" type="date" required defaultValue={todayISO()} className="input" />
            </label>
            <label className="sm:col-span-2 lg:col-span-1">
              <span className="label">Note</span>
              <input name="note" className="input" placeholder="Optional" />
            </label>
            <div className="sm:col-span-2 lg:col-span-5">
              <button className="btn-primary">Save</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function BreakdownTable({
  rows,
  goalUnit,
  target,
  supOpts,
  smallN,
}: {
  rows: Measurement[];
  goalUnit: "percent" | "count";
  target: number;
  supOpts: { suppressSmallN: boolean; isOwner: boolean; smallN: number };
  smallN: number;
}) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((m) => {
          const hide = suppressed(m.denominator, supOpts);
          const v = valueOf(goalUnit, m);
          const below = !hide && v !== null && goalUnit === "percent" && v < target;
          return (
            <tr key={m.id} className="border-b border-gray-brand/10">
              <td className="py-1.5 pr-2">{m.breakdown_value}</td>
              <td className="py-1.5 text-right">
                <Value unit={goalUnit} numerator={m.numerator} denominator={m.denominator} suppressed={hide} smallGroup={supOpts.isOwner && supOpts.suppressSmallN && m.denominator !== null && m.denominator < smallN} />
                {below && (
                  <span className="ml-1 text-xs font-bold text-coral-ink" title="Below target">
                    ▼ below
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MemberList({ title, rows, emphasis = false, showReason = false }: { title: string; rows: MemberRow[]; emphasis?: boolean; showReason?: boolean }) {
  return (
    <div>
      {title && <h3 className={`mb-1 font-bold ${emphasis ? "text-coral-ink" : ""}`}>{title}</h3>}
      {rows.length ? (
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <li key={m.resident_id}>
              <span className="font-semibold">{residentName(m)}</span>
              <span className="text-muted">
                {" "}
                · {m.campus ?? "—"}
                {m.grade_band ? ` · ${m.grade_band}` : ""}
                {m.raw_value ? ` · "${m.raw_value}"` : ""}
                {showReason && m.reason ? ` · ${m.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None.</p>
      )}
    </div>
  );
}
