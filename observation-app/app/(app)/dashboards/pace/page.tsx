import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset, setting } from "@/lib/data";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { cycleForDate } from "@/lib/rules";
import { pct } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export default async function PacePage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const today = todayISO();
  const cycleNo = sp.cycle ? Number(sp.cycle) : cycleForDate(today, cfg.cycles);
  const cyc = cfg.cycles.find((c) => c.number === cycleNo) ?? cfg.cycles[0];
  const per = setting(cfg, "expected_obs_per_cycle", 3);
  const active = ds.residents.filter((r) => r.active);
  const inCycle = ds.observations.filter((o) => o.cycle === cyc.number);

  const weeks: string[] = [];
  for (let w = mondayOf(cyc.start_date); w <= cyc.end_date; w = addDays(w, 7)) weeks.push(w);
  const totalWeeks = weeks.length;
  const elapsedWeeks = weeks.filter((w) => w <= today).length;

  const byObserver = cfg.observers.map((o) => {
    const advisees = active.filter((r) => r.advisor_code === o.advisor_code).length;
    const expected = advisees * per;
    const done = inCycle.filter((x) => x.observer_id === o.id).length;
    const onPace = Math.round((expected * elapsedWeeks) / Math.max(1, totalWeeks));
    return { o, advisees, expected, done, onPace, perWeek: weeks.map((w) => inCycle.filter((x) => x.observer_id === o.id && mondayOf(x.observed_date) === w).length) };
  });
  const maxWeek = Math.max(1, ...byObserver.flatMap((b) => b.perWeek));
  const notObserved = active.filter((r) => !inCycle.some((o) => o.resident_id === r.id));
  const counts = active.map((r) => ({ r, n: inCycle.filter((o) => o.resident_id === r.id).length })).sort((a, b) => a.n - b.n);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Observation pace</h1>
          <p className="text-sm text-muted">Cycle {cyc.number}: {cyc.theme}, {formatShort(cyc.start_date)} to {formatShort(cyc.end_date)}. Expected = advisees × {per} per cycle (change in Settings).</p>
        </div>
        <form className="flex gap-2">
          <select name="cycle" defaultValue={cyc.number} className="input !w-auto" aria-label="Cycle">{cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}</select>
          <button className="btn-small">Show</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {byObserver.map((b) => (
          <section key={b.o.id} className="card" aria-label={`${b.o.name} pace`}>
            <h2 className="h3">{b.o.name}</h2>
            <p className="text-3xl font-bold text-teal-ink">{b.done}<span className="text-base font-semibold text-muted"> of {b.expected} expected ({pct(b.done, b.expected)})</span></p>
            <p className="text-sm text-muted">{b.advisees} advisees. On pace for week {elapsedWeeks} of {totalWeeks} would be about {b.onPace}.</p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-sand" role="img" aria-label={`${pct(b.done, b.expected)} complete`}>
              <div className="h-full bg-teal" style={{ width: `${Math.min(100, (100 * b.done) / Math.max(1, b.expected))}%` }} />
            </div>
          </section>
        ))}
      </div>

      <section className="card overflow-x-auto" aria-labelledby="wk-h">
        <h2 id="wk-h" className="h3">By week</h2>
        <table className="table-basic mt-2">
          <thead><tr><th scope="col">Week of</th>{byObserver.map((b) => <th key={b.o.id} scope="col">{b.o.name}</th>)}<th scope="col">Total</th></tr></thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w} className={w > today ? "text-muted" : ""}>
                <td>{formatShort(w)}</td>
                {byObserver.map((b) => (
                  <td key={b.o.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2.5 rounded bg-teal" style={{ width: `${(60 * b.perWeek[i]) / maxWeek}px` }} aria-hidden />
                      {b.perWeek[i]}
                    </span>
                  </td>
                ))}
                <td>{byObserver.reduce((a, b) => a + b.perWeek[i], 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="no-h">
          <h2 id="no-h" className="h3">Not observed in Cycle {cyc.number} ({notObserved.length})</h2>
          <ul className="mt-2 columns-1 text-sm sm:columns-2">
            {notObserved.map((r) => <li key={r.id}><Link className="link" href={`/residents/${r.id}`}>{r.full_name}</Link> <span className="text-muted">({r.advisor_code || "?"})</span></li>)}
          </ul>
        </section>
        <section className="card" aria-labelledby="ct-h">
          <h2 id="ct-h" className="h3">Observations per resident this cycle</h2>
          <ul className="mt-2 text-sm">
            {counts.map(({ r, n }) => (
              <li key={r.id} className="flex justify-between gap-2 border-b border-gray-brand/10 py-0.5">
                <span>{r.full_name}</span><span className={n < per ? "font-bold text-coral-ink" : ""}>{n} / {per}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
