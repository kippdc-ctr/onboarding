import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import { ScorePill } from "@/components/Score";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function ObservationsPage({ searchParams }: { searchParams: Promise<{ observer?: string; cycle?: string; campus?: string; q?: string; unsent?: string; ok?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const res = new Map(ds.residents.map((r) => [r.id, r]));
  const q = (sp.q ?? "").toLowerCase().trim();
  const list = [...ds.observations]
    .reverse()
    .filter((o) => !sp.observer || o.observer_id === sp.observer)
    .filter((o) => !sp.cycle || String(o.cycle) === sp.cycle)
    .filter((o) => !sp.campus || res.get(o.resident_id)?.campus === sp.campus)
    .filter((o) => !q || (res.get(o.resident_id)?.full_name ?? "").toLowerCase().includes(q))
    .filter((o) => !sp.unsent || (o.send_flag && !o.sent_at));
  const shown = cfg.scoredIndicators;
  return (
    <div className="space-y-4">
      <Flash ok={sp.ok} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="h1">Observations</h1>
        <a className="btn-small" href="/export/observations">Download CSV</a>
      </div>
      <form className="card grid gap-2 !p-4 sm:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Resident name" className="input" aria-label="Resident name" />
        <select name="observer" defaultValue={sp.observer ?? ""} className="input" aria-label="Observer">
          <option value="">All observers</option>
          {cfg.observers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select name="cycle" defaultValue={sp.cycle ?? ""} className="input" aria-label="Cycle">
          <option value="">All cycles</option>
          {cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}
        </select>
        <select name="campus" defaultValue={sp.campus ?? ""} className="input" aria-label="Campus">
          <option value="">All campuses</option>
          {cfg.campuses.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="unsent" value="1" defaultChecked={!!sp.unsent} /> Email not sent</label>
          <button className="btn-small">Filter</button>
        </div>
      </form>
      <p className="text-sm text-muted">{list.length} observation{list.length === 1 ? "" : "s"}</p>
      <div className="card overflow-x-auto !p-0">
        <table className="table-basic">
          <thead>
            <tr>
              <th scope="col">Date</th><th scope="col">Resident</th><th scope="col">Type</th><th scope="col">Observer</th><th scope="col">Cycle</th>
              {shown.map((i) => <th key={i.code} scope="col" className="text-center text-xs" title={i.name}>{i.code}</th>)}
              <th scope="col">Email</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><Link className="link" href={`/observations/${o.id}`}>{formatShort(o.observed_date)}</Link></td>
                <td className="whitespace-nowrap">{res.get(o.resident_id)?.full_name}</td>
                <td>{o.type}</td>
                <td>{cfg.observers.find((x) => x.id === o.observer_id)?.name}</td>
                <td className="text-center">{o.cycle}</td>
                {shown.map((i) => {
                  const s = o.scores.find((x) => x.indicator === i.code);
                  return <td key={i.code} className="text-center">{s?.score ? <ScorePill size="sm" score={s.score} early={s.expected_status === "early"} /> : <span className="text-muted">–</span>}</td>;
                })}
                <td className="whitespace-nowrap text-xs">{!o.send_flag ? "Not sending" : o.sent_at ? "Sent" : <b className="text-coral-ink">Not sent</b>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
