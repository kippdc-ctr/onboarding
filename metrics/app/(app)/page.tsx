import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { CATEGORIES, getGoals, getSettings, getYear, listYears, scoreGoals, ScoredGoal, TYPE_LABEL } from "@/lib/data";
import { suppressed } from "@/lib/compute";
import { formatTarget, formatValue, GoalStatus, STATUS_LABEL, valueOf } from "@/lib/status";
import { fmtDate, todayISO } from "@/lib/dates";
import { ChangeArrow, StatusChip, TypeChip } from "@/components/Chips";
import { Value } from "@/components/Value";
import { Flash, flashFrom } from "@/components/Flash";

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

const STRIP: GoalStatus[] = ["met", "close", "off_track", "not_yet", "no_data"];

export default async function Scorecard({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const year = await getYear(one(sp, "year"));
  const [years, goals, settings] = await Promise.all([listYears(), getGoals(year.id), getSettings()]);
  const scored = await scoreGoals(year, goals);
  const f = { category: one(sp, "category"), type: one(sp, "type"), status: one(sp, "status"), window: one(sp, "window") };
  const windows = [...new Set(goals.map((g) => g.measured_label))].sort();

  const big = scored.find((s) => s.goal.number === 0);
  const program = scored.filter((s) => s.goal.number !== 0);
  const counts = Object.fromEntries(STRIP.map((st) => [st, program.filter((s) => s.ev.status === st).length])) as Record<GoalStatus, number>;
  const visible = program.filter(
    (s) => (!f.category || s.goal.category === f.category) && (!f.type || s.goal.type === f.type) && (!f.status || s.ev.status === f.status) && (!f.window || s.goal.measured_label === f.window),
  );
  const isOwner = can.seeSmallN(u);
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(sp.year ? { year: year.id } : {}), ...f, ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/?${p}`;
  };

  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{year.id} Program Scorecard</h1>
          <p className="text-muted">
            As of {fmtDate(todayISO())}. Compared with SY25-26 actuals. {year.locked && <strong className="text-coral-ink">This year is locked.</strong>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {years.length > 1 && (
            <form className="flex items-center gap-2">
              <label htmlFor="year" className="text-sm font-semibold">
                School year
              </label>
              <select id="year" name="year" defaultValue={year.id} className="input min-h-10 w-auto py-1">
                {years.map((y) => (
                  <option key={y.id}>{y.id}</option>
                ))}
              </select>
              <button className="btn-small">Go</button>
            </form>
          )}
          <a href={`/export/scorecard?year=${encodeURIComponent(year.id)}`} className="btn-small">
            Download CSV
          </a>
        </div>
      </div>

      {/* Top strip: counts by status. Each tile filters the list. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Goals by status">
        {STRIP.map((st) => (
          <li key={st}>
            <Link
              href={q({ status: f.status === st ? "" : st })}
              aria-current={f.status === st ? "true" : undefined}
              className={`card flex h-full flex-col gap-2 p-4 hover:border-teal sm:p-4 ${f.status === st ? "border-2 border-teal-ink" : ""}`}
            >
              <span className="text-4xl font-bold text-ink">{counts[st]}</span>
              <StatusChip status={st} />
            </Link>
          </li>
        ))}
      </ul>

      {big && <BigGoal s={big} />}

      <form className="card flex flex-wrap items-end gap-3 p-4 sm:p-4" aria-label="Filters">
        {sp.year && <input type="hidden" name="year" value={year.id} />}
        <Select name="category" label="Category" value={f.category} options={CATEGORIES.slice(1).map((c) => [c, c])} />
        <Select name="type" label="Type" value={f.type} options={Object.entries(TYPE_LABEL)} />
        <Select name="status" label="Status" value={f.status} options={STRIP.map((s) => [s, STATUS_LABEL[s]])} />
        <Select name="window" label="Measured at" value={f.window} options={windows.map((w) => [w, w])} />
        <button className="btn-small">Filter</button>
        {(f.category || f.type || f.status || f.window) && (
          <Link href={sp.year ? `/?year=${year.id}` : "/"} className="link text-sm">
            Clear
          </Link>
        )}
        <span className="ml-auto text-sm text-muted">
          Showing {visible.length} of {program.length} goals
        </span>
      </form>

      {CATEGORIES.slice(1)
        .map((cat) => [cat, visible.filter((s) => s.goal.category === cat)] as const)
        .filter(([, rows]) => rows.length)
        .map(([cat, rows]) => (
          <section key={cat} className="card p-0 sm:p-0" aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="h3 border-b border-gray-brand/20 px-4 py-3 sm:px-5">
              {cat}
            </h2>
            <div className="hidden grid-cols-[minmax(0,1fr)_5rem_10rem_9rem_9.5rem_7rem] gap-3 border-b border-gray-brand/20 px-5 py-2 text-sm font-bold text-muted lg:grid">
              <span>Goal</span>
              <span>Target</span>
              <span>Current</span>
              <span>SY25-26</span>
              <span>Status</span>
              <span>Data through</span>
            </div>
            <ul>
              {rows.map((s) => (
                <GoalRow key={s.goal.id} s={s} smallN={settings.smallN} isOwner={isOwner} />
              ))}
            </ul>
          </section>
        ))}
      {!visible.length && <p className="card text-muted">No goals match these filters.</p>}
      <p className="text-sm text-muted">
        Met = at or above target. Close = within {settings.closePoints} points below. Off track = more than {settings.closePoints} points below. Not yet measured = the
        goal&apos;s measurement window hasn&apos;t opened. No data = window open, nothing imported. No change = within {settings.noChangePoints} point of SY25-26.
      </p>
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="label text-sm">{label}</span>
      <select name={name} defaultValue={value} className="input min-h-10 w-auto py-1">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function GoalRow({ s, smallN, isOwner }: { s: ScoredGoal; smallN: number; isOwner: boolean }) {
  const { goal: g, ev } = s;
  const cur = ev.current;
  const hide = cur ? suppressed(cur.denominator, { suppressSmallN: g.suppress_small_n, isOwner, smallN }) : false;
  const small = !!cur && isOwner && g.suppress_small_n && cur.denominator !== null && cur.denominator < smallN;
  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-gray-brand/10 px-4 py-3 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_5rem_10rem_9rem_9.5rem_7rem] lg:items-center">
      <div className="col-span-2 lg:col-span-1">
        <Link href={`/goals/${g.id}`} className="font-semibold text-ink hover:text-teal-ink hover:underline">
          <span className="text-muted">{g.number}.</span> {g.text}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <TypeChip type={g.type} />
          <span>Measured at: {g.measured_label}</span>
          {!g.target_confirmed && <span className="text-xs font-semibold text-coral-ink">target to confirm</span>}
        </div>
      </div>
      <Cell label="Target">
        <span className="font-bold">{formatTarget(g)}</span>
      </Cell>
      <Cell label="Current">
        {cur ? (
          <>
            <Value unit={g.unit} numerator={ev.pace ? ev.pace.actual : cur.numerator} denominator={ev.pace ? null : cur.denominator} suppressed={hide} smallGroup={small} />
            <span className="block text-xs text-muted">{ev.pace ? `${ev.pace.periodsDone} of ${ev.pace.periodsTotal} ${g.pace_by}s done · expected ${ev.pace.expected}` : cur.period}</span>
          </>
        ) : ev.interim ? (
          <span className="text-sm text-muted">
            Interim {suppressed(ev.interim.denominator, { suppressSmallN: g.suppress_small_n, isOwner, smallN }) ? "n < 5" : formatValue(g.unit, valueOf(g.unit, ev.interim))} ({ev.interim.period})
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Cell>
      <Cell label="SY25-26">
        <span className="flex flex-wrap items-center gap-x-2">
          <span>{g.baseline_value === null ? <span className="text-muted">no baseline</span> : formatValue(g.unit, g.baseline_value)}</span>
          {cur && !hide && <ChangeArrow change={ev.change} fewerIsBetter={g.direction === "at_most"} />}
          {!cur && g.baseline_value === null && <ChangeArrow change="new" />}
        </span>
      </Cell>
      <Cell label="Status">
        <StatusChip status={ev.status} label={ev.pace && ev.status === "met" && ev.pace.periodsDone < ev.pace.periodsTotal ? "On pace" : undefined} />
      </Cell>
      <Cell label="Data through">
        <span className="text-sm">{cur ? fmtDate(cur.data_through) : ev.status === "not_yet" && ev.windowOpens ? `Opens ${fmtDate(ev.windowOpens)}` : "—"}</span>
      </Cell>
    </li>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-bold text-muted lg:hidden">{label}</span>
      {children}
    </div>
  );
}

function BigGoal({ s }: { s: ScoredGoal }) {
  const { goal: g, ev } = s;
  return (
    <section className="card border-2 border-teal bg-teal-wash/40" aria-labelledby="big-goal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="big-goal" className="text-sm font-bold uppercase tracking-wide text-teal-ink">
            Big Goal
          </h2>
          <Link href={`/goals/${g.id}`} className="mt-1 block text-lg font-semibold text-ink hover:underline">
            {g.text}
          </Link>
        </div>
        <div className="flex flex-col items-end gap-2">
          {ev.current ? <Value unit={g.unit} numerator={ev.current.numerator} denominator={ev.current.denominator} big /> : <span className="text-muted">Target {formatTarget(g)}</span>}
          <StatusChip status={ev.status} />
        </div>
      </div>
    </section>
  );
}
