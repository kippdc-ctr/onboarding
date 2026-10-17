import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { assignmentFacts, avgDelta, pct } from "@/lib/analytics";
import { fmtAvg } from "@/lib/rules";

export const dynamic = "force-dynamic";

const fmtDelta = (d: { avg: number | null; n: number }) => (d.avg === null ? "–" : `${d.avg > 0 ? "+" : ""}${fmtAvg(d.avg)} (n=${d.n})`);

export default async function StepAnalyticsPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const all = assignmentFacts(ds);
  const facts = sp.cycle ? all.filter((f) => String(f.cycle) === sp.cycle) : all;
  const steps = new Map(ds.steps.map((s) => [s.id, s]));
  const resName = (id: string) => ds.residents.find((r) => r.id === id)?.full_name ?? "";

  const byStep = new Map<string, typeof facts>();
  for (const f of facts) {
    const k = f.stepId ?? `custom:${f.text}`;
    if (!byStep.has(k)) byStep.set(k, []);
    byStep.get(k)!.push(f);
  }
  const stepRows = [...byStep.entries()].map(([k, fs]) => {
    const st = fs[0].stepId ? steps.get(fs[0].stepId) : null;
    const withFollow = fs.filter((f) => f.follow && f.follow !== "not_observed");
    return {
      k, st, text: st?.text ?? fs[0].text, indicator: st?.indicator ?? fs[0].indicator, n: fs.length,
      yes: fs.filter((f) => f.follow === "yes").length, partially: fs.filter((f) => f.follow === "partially").length,
      no: fs.filter((f) => f.follow === "no").length, notObs: fs.filter((f) => f.follow === "not_observed").length, checked: withFollow.length,
      delta: avgDelta(fs),
    };
  }).sort((a, b) => b.n - a.n);

  const split = (["yes", "partially", "no"] as const).map((r) => ({ r, d: avgDelta(facts.filter((f) => f.follow === r)) }));

  // Steps assigned 3+ times to one resident with no gain on the target indicator.
  const repeat: { resident: string; rid: string; text: string; n: number; first: number | null; last: number | null }[] = [];
  const groups = new Map<string, typeof facts>();
  for (const f of all) {
    if (!f.stepId) continue;
    const k = `${f.residentId}|${f.stepId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(f);
  }
  for (const fs of groups.values()) {
    if (fs.length < 3) continue;
    const first = fs[0].base;
    const lastF = fs[fs.length - 1];
    const last = lastF.next ?? lastF.base;
    if (first !== null && last !== null && last <= first) repeat.push({ resident: resName(fs[0].residentId), rid: fs[0].residentId, text: fs[0].text, n: fs.length, first, last });
  }

  const used = new Set(all.map((f) => f.stepId).filter(Boolean));
  const neverUsed = ds.steps.filter((s) => s.status === "active" && !used.has(s.id));
  const indicators = cfg.indicators.filter((i) => facts.some((f) => f.indicator === i.code));
  const cycles = cfg.cycles.filter((c) => facts.some((f) => f.cycle === c.number));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Action step analytics</h1>
          <p className="text-sm text-muted">{facts.length} assigned steps. Score change = target-indicator score at the next observation that scored it, minus the score when the step was assigned.</p>
        </div>
        <form className="flex gap-2">
          <select name="cycle" defaultValue={sp.cycle ?? ""} className="input !w-auto" aria-label="Cycle"><option value="">All cycles</option>{cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}</select>
          <button className="btn-small">Show</button>
        </form>
      </div>

      <section className="card" aria-labelledby="sp-h">
        <h2 id="sp-h" className="h3">Average score change by follow-through</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {split.map(({ r, d }) => (
            <div key={r} className="rounded-xl bg-sand p-3">
              <p className="text-sm font-semibold">Follow-through: {r === "yes" ? "Yes" : r === "partially" ? "Partially" : "No"}</p>
              <p className="text-2xl font-bold text-teal-ink">{d.avg === null ? "–" : `${d.avg > 0 ? "+" : ""}${fmtAvg(d.avg)}`}</p>
              <p className="text-xs text-muted">n = {d.n} with a later score</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-x-auto" aria-labelledby="bs-h">
        <h2 id="bs-h" className="h3">By step</h2>
        <table className="table-basic mt-2">
          <thead><tr><th scope="col">Step</th><th scope="col">Indicator</th><th scope="col">Assigned</th><th scope="col">Yes</th><th scope="col">Partially</th><th scope="col">No</th><th scope="col">Not obs.</th><th scope="col">Follow-through rate</th><th scope="col">Avg score change</th></tr></thead>
          <tbody>
            {stepRows.map((r) => (
              <tr key={r.k}>
                <td className="min-w-64">{r.st ? <Link className="link" href={`/library/${r.st.id}`}>{r.st.id}</Link> : <span className="text-xs text-muted">typed</span>}{r.st?.is_legacy && <span className="text-xs text-muted"> legacy</span>} {r.text}</td>
                <td>{r.indicator}</td><td className="text-center">{r.n}</td>
                <td className="text-center">{r.yes}</td><td className="text-center">{r.partially}</td><td className="text-center">{r.no}</td><td className="text-center">{r.notObs}</td>
                <td className="text-center" title="Yes, out of assignments checked (Yes + Partially + No)">{pct(r.yes, r.checked)}</td>
                <td className="text-center">{fmtDelta(r.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto" aria-labelledby="ic-h">
        <h2 id="ic-h" className="h3">Assignments by indicator and cycle</h2>
        <table className="table-basic mt-2">
          <thead><tr><th scope="col">Indicator</th>{cycles.map((c) => <th key={c.number} scope="col" className="text-center">C{c.number}</th>)}<th scope="col" className="text-center">Total</th></tr></thead>
          <tbody>
            {indicators.map((i) => (
              <tr key={i.code}>
                <td>{i.code} {i.short_label}</td>
                {cycles.map((c) => <td key={c.number} className="text-center">{facts.filter((f) => f.indicator === i.code && f.cycle === c.number).length || ""}</td>)}
                <td className="text-center font-bold">{facts.filter((f) => f.indicator === i.code).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="rp-h">
          <h2 id="rp-h" className="h3">Assigned 3+ times to one resident with no gain</h2>
          {repeat.length === 0 ? <p className="mt-2 text-muted">None.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{repeat.map((x, i) => <li key={i}><Link className="link" href={`/residents/${x.rid}`}>{x.resident}</Link>: {x.text} ({x.n}×, {x.first} → {x.last})</li>)}</ul>
          )}
        </section>
        <section className="card" aria-labelledby="nu-h">
          <h2 id="nu-h" className="h3">Active steps never used ({neverUsed.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">{neverUsed.map((s) => <li key={s.id}><Link className="link" href={`/library/${s.id}`}>{s.id}</Link> {s.indicator}: {s.text}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}
