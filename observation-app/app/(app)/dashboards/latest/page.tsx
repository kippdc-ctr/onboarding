import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { summarize } from "@/lib/summary";
import { fmtAvg } from "@/lib/rules";
import { formatShort, todayISO } from "@/lib/dates";
import { ScorePill } from "@/components/Score";
import { TrackChip } from "@/components/TrackChip";

export const dynamic = "force-dynamic";

export default async function LatestPage({ searchParams }: { searchParams: Promise<{ campus?: string; advisor?: string; grade?: string; observer?: string; cycle?: string; inactive?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const cyc = sp.cycle ? cfg.cycles.find((c) => String(c.number) === sp.cycle) : null;
  const today = todayISO();
  const asOf = cyc && cyc.end_date < today ? cyc.end_date : today;
  const rows = ds.residents
    .filter((r) => sp.inactive || r.active)
    .filter((r) => !sp.campus || r.campus === sp.campus)
    .filter((r) => !sp.advisor || r.advisor_code === sp.advisor)
    .filter((r) => !sp.grade || r.grade_band === sp.grade)
    .filter((r) => !sp.observer || (ds.byResident.get(r.id) ?? []).some((o) => o.observer_id === sp.observer))
    .map((r) => {
      const obs = (ds.byResident.get(r.id) ?? []).filter((o) => o.observed_date <= asOf);
      return { s: summarize(r, obs, cfg, ds.rules.get(r.id)!, asOf), obs };
    });
  const advisors = [...new Set(ds.residents.map((r) => r.advisor_code).filter(Boolean))].sort();
  const grades = [...new Set(ds.residents.map((r) => r.grade_band).filter(Boolean))].sort();
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Latest scores</h1>
          <p className="text-sm text-muted">As of {formatShort(asOf)}. A dash means the indicator isn&apos;t expected for that resident yet; <b className="text-coral-ink">miss</b> means it is expected but hasn&apos;t been scored.</p>
        </div>
        <a className="btn-small" href={`/export/latest${qs ? `?${qs}` : ""}`}>Download CSV</a>
      </div>
      <form className="card grid gap-2 !p-4 sm:grid-cols-7">
        <select name="campus" defaultValue={sp.campus ?? ""} className="input" aria-label="Campus"><option value="">All campuses</option>{cfg.campuses.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="advisor" defaultValue={sp.advisor ?? ""} className="input" aria-label="Advisor"><option value="">All advisors</option>{advisors.map((a) => <option key={a}>{a}</option>)}</select>
        <select name="grade" defaultValue={sp.grade ?? ""} className="input" aria-label="Grade band"><option value="">All grade bands</option>{grades.map((a) => <option key={a}>{a}</option>)}</select>
        <select name="observer" defaultValue={sp.observer ?? ""} className="input" aria-label="Observed by"><option value="">Any observer</option>{cfg.observers.map((o) => <option key={o.id} value={o.id}>Observed by {o.name}</option>)}</select>
        <select name="cycle" defaultValue={sp.cycle ?? ""} className="input" aria-label="As of the end of cycle"><option value="">As of today</option>{cfg.cycles.map((c) => <option key={c.number} value={c.number}>End of Cycle {c.number}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="inactive" value="1" defaultChecked={!!sp.inactive} /> Inactive too</label>
        <button className="btn-small">Filter</button>
      </form>
      <div className="card overflow-x-auto !p-0">
        <table className="table-basic text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-white">Resident</th><th scope="col">Track</th><th scope="col">Advisor</th><th scope="col">School</th><th scope="col">Campus</th>
              {cfg.scoredIndicators.map((i) => <th key={i.code} scope="col" className="text-center" title={i.name}>{i.code}</th>)}
              <th scope="col" title="Learning Environment (100% Cycle) average">100% avg</th><th scope="col">Prep</th><th scope="col">Instr.</th>
              <th scope="col">Last obs</th><th scope="col">Days</th><th scope="col">This cycle</th><th scope="col">Current action step</th><th scope="col">Lesson type</th>
              {cfg.cycles.filter((c) => c.number > 0).map((c) => <th key={c.number} scope="col">C{c.number}</th>)}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, obs }) => {
              const last = s.lastObs;
              return (
                <tr key={s.resident.id}>
                  <td className="sticky left-0 whitespace-nowrap bg-white"><Link className="link" href={`/residents/${s.resident.id}`}>{s.resident.full_name}</Link></td>
                  <td><TrackChip track={s.standing.track} name={s.standing.trackName} /></td>
                  <td>{s.resident.advisor_code}</td><td>{s.resident.school}</td><td>{s.resident.campus}</td>
                  {cfg.scoredIndicators.map((i) => {
                    const l = s.latest.get(i.code);
                    return (
                      <td key={i.code} className="text-center">
                        {l ? <ScorePill size="sm" score={l.score} early={l.early} /> : s.expected.has(i.code) ? <span className="font-bold text-coral-ink">miss</span> : <span className="text-muted">–</span>}
                      </td>
                    );
                  })}
                  <td className="text-center font-semibold">{fmtAvg(s.areaAvg["Learning Environment"])}</td>
                  <td className="text-center">{fmtAvg(s.areaAvg["Intellectual Prep"])}</td>
                  <td className="text-center">{fmtAvg(s.areaAvg["Responsive Instruction"])}</td>
                  <td className="whitespace-nowrap">{last ? formatShort(last.observed_date) : "Never"}</td>
                  <td className="text-center">{s.daysSince ?? ""}</td>
                  <td className="text-center">{s.obsThisCycle}</td>
                  <td className="min-w-48">{last?.steps.map((st) => <div key={st.id}>{st.indicator ? `${st.indicator}: ` : ""}{st.wording_snapshot}</div>)}</td>
                  <td>{last?.involvement}</td>
                  {cfg.cycles.filter((c) => c.number > 0).map((c) => <td key={c.number} className="text-center">{obs.some((o) => o.cycle === c.number) ? "Yes" : <span className="text-muted">No</span>}</td>)}
                  <td>{s.resident.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
