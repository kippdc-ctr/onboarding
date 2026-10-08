import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset, setting } from "@/lib/data";
import { latestByIndicator, scoreMap } from "@/lib/summary";
import { average, cycleForDate, daysBetween, expectedIndicators, readyToAdvance, standingAt } from "@/lib/rules";
import { formatShort, todayISO } from "@/lib/dates";
import { ScorePill } from "@/components/Score";
import { TrackChip } from "@/components/TrackChip";

export const dynamic = "force-dynamic";

type Row = {
  id: string; name: string; campus: string; advisor: string; track: string; trackName: string; tier: number;
  expected: string[]; latest: Record<string, number | null>; obsInCycle: number; daysSince: number | null; why: string;
};

export default async function CloseoutPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const today = todayISO();
  const cycleNo = sp.cycle ? Number(sp.cycle) : cycleForDate(today, cfg.cycles);
  const cyc = cfg.cycles.find((c) => c.number === cycleNo) ?? cfg.cycles[0];
  const asOf = cyc.end_date < today ? cyc.end_date : today;
  const threshold = setting(cfg, "advance_threshold", 3);
  const count = setting(cfg, "advance_observations", 2);
  const per = setting(cfg, "expected_obs_per_cycle", 3);

  const groups: Record<"advance" | "ontrack" | "visit" | "hold" | "accelerated" | "developing", Row[]> = { advance: [], ontrack: [], visit: [], hold: [], accelerated: [], developing: [] };
  for (const r of ds.residents.filter((x) => x.active)) {
    const rules = ds.rules.get(r.id)!;
    const obs = (ds.byResident.get(r.id) ?? []).filter((o) => o.observed_date <= asOf);
    const exp = expectedIndicators(asOf, cfg, rules);
    const st = standingAt(asOf, cfg, rules);
    const recent = [...obs].reverse().map((o) => ({ scores: scoreMap(o) }));
    const latest = latestByIndicator(obs);
    const lastDate = obs.length ? obs[obs.length - 1].observed_date : null;
    const row: Row = {
      id: r.id, name: r.full_name, campus: r.campus, advisor: r.advisor_code, track: st.track, trackName: st.trackName, tier: st.tier,
      expected: [...exp], latest: Object.fromEntries([...exp].map((c) => [c, latest.get(c)?.score ?? null])),
      obsInCycle: obs.filter((o) => o.cycle === cyc.number).length, daysSince: lastDate ? daysBetween(lastDate, asOf) : null, why: "",
    };
    const latestVals = Object.values(row.latest).filter((v): v is number => v !== null);
    const lows = [...exp].filter((c) => (latest.get(c)?.score ?? 99) <= 1);
    if (st.track === "accelerated") { row.why = "On an accelerated track"; groups.accelerated.push(row); }
    if (st.track === "developing") { row.why = "On a developing track"; groups.developing.push(row); }
    if (readyToAdvance(recent, exp, threshold, count)) {
      row.why = `All ${exp.size} expected indicators at ${threshold}+ in the last ${count} observations`;
      groups.advance.push(row);
    } else if (lows.length || (latestVals.length >= 2 && average(latestVals)! < 2.5)) {
      row.why = lows.length ? `Area of concern on ${lows.join(", ")}` : "Average of latest expected scores below 2.5";
      groups.hold.push(row);
    } else if (row.obsInCycle < per || row.daysSince === null || row.daysSince > 21) {
      row.why = row.daysSince === null ? "Never observed" : `${row.obsInCycle} of ${per} observations this cycle; last ${row.daysSince} days ago`;
      groups.visit.push(row);
    } else {
      row.why = "Observed on pace; not yet at the advance bar";
      groups.ontrack.push(row);
    }
  }

  const Section = ({ title, rows, note }: { title: string; rows: Row[]; note: string }) => (
    <section className="card" aria-label={title}>
      <h2 className="h3">{title} ({rows.length})</h2>
      <p className="text-sm text-muted">{note}</p>
      {rows.length === 0 ? <p className="mt-2 text-muted">None.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="table-basic">
            <thead><tr><th scope="col">Resident</th><th scope="col">Track</th><th scope="col">Latest expected scores</th><th scope="col">Why</th><th scope="col"></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap"><Link className="link" href={`/residents/${r.id}`}>{r.name}</Link><div className="text-xs text-muted">{r.campus} · {r.advisor}</div></td>
                  <td><TrackChip track={r.track} name={r.trackName} tier={r.tier} /></td>
                  <td><span className="flex flex-wrap gap-1">{r.expected.map((c) => <span key={c} className="inline-flex items-center gap-0.5 text-xs" title={c}>{c.replace(/^C[CK]\./, "")}<ScorePill size="sm" score={r.latest[c]} /></span>)}</span></td>
                  <td className="text-sm">{r.why}</td>
                  <td><Link className="btn-small whitespace-nowrap" href={`/residents/${r.id}#tr-h`}>Record decision</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Cycle close-out</h1>
          <p className="text-sm text-muted">
            Cycle {cyc.number} ({formatShort(cyc.start_date)} to {formatShort(cyc.end_date)}), as of {formatShort(asOf)}. The app recommends; the advisor decides.
            Advance bar: every expected indicator at {threshold}+ in the last {count} observations (change in Settings).
          </p>
        </div>
        <form className="flex gap-2">
          <select name="cycle" defaultValue={cyc.number} className="input !w-auto" aria-label="Cycle">{cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}</select>
          <button className="btn-small">Show</button>
        </form>
      </div>
      <Section title="Recommended to advance" rows={groups.advance} note="Consider moving to the next tier (Accelerated) or confirm they stay on the Standard calendar." />
      <Section title="Consider a hold" rows={groups.hold} note="Consider a Developing track so later indicators aren't counted as missing." />
      <Section title="Needs an extra visit" rows={groups.visit} note={`Fewer than ${per} observations this cycle, or more than 21 days since the last one.`} />
      <Section title="On track" rows={groups.ontrack} note="Observed on pace." />
      <Section title="Already accelerated" rows={groups.accelerated} note="Residents on an Accelerated track (also listed above where they fit)." />
      <Section title="Developing" rows={groups.developing} note="Residents on a Developing track (also listed above where they fit)." />
    </div>
  );
}
