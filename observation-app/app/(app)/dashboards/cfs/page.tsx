import { Fragment } from "react";
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { latestByIndicator } from "@/lib/summary";
import { formatShort, todayISO } from "@/lib/dates";
import { cls } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function CfsPage({ searchParams }: { searchParams: Promise<{ asof?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(sp.asof ?? "") ? sp.asof! : todayISO();
  const active = ds.residents.filter((r) => r.active);
  const latest = new Map(active.map((r) => [r.id, latestByIndicator((ds.byResident.get(r.id) ?? []).filter((o) => o.observed_date <= asOf))]));
  const cols = [...cfg.campuses, "All"];

  // Percent of residents (with a counted latest score on the indicator) whose latest observation showed the CFS.
  const cell = (cfsId: string, ind: string, campus: string) => {
    const rs = active.filter((r) => campus === "All" || r.campus === campus);
    const scored = rs.map((r) => latest.get(r.id)!.get(ind)).filter((l) => l && !l.early);
    const yes = scored.filter((l) => l!.cfs.includes(cfsId)).length;
    return { n: scored.length, p: scored.length ? Math.round((100 * yes) / scored.length) : null };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">CFS heatmap</h1>
          <p className="text-sm text-muted">Percent of currently enrolled residents demonstrating each look-for at their latest counted score, as of {formatShort(asOf)}. Under 50% in red. Small n in gray.</p>
        </div>
        <form className="flex gap-2"><input type="date" name="asof" defaultValue={asOf} className="input !w-auto" aria-label="As of" /><button className="btn-small">Show</button></form>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="table-basic text-xs">
          <thead><tr><th scope="col">Look-for</th>{cols.map((c) => <th key={c} scope="col" className="text-center">{c}</th>)}</tr></thead>
          <tbody>
            {cfg.scoredIndicators.map((ind) => (
              <Fragment key={ind.code}>
                <tr><th colSpan={cols.length + 1} scope="colgroup" className="bg-sand !text-teal-ink">{ind.code} {ind.short_label}</th></tr>
                {cfg.cfs.filter((c) => c.indicator === ind.code).map((c) => (
                  <tr key={c.id}>
                    <td className="min-w-56" title={c.full_text}>{c.short_label}</td>
                    {cols.map((col) => {
                      const v = cell(c.id, ind.code, col);
                      const bg = v.p === null ? undefined : `rgba(73,152,164,${0.08 + (0.6 * v.p) / 100})`;
                      return (
                        <td key={col} className={cls("text-center", col === "All" && "font-bold")} style={{ background: bg }}>
                          {v.p === null ? <span className="text-muted">–</span> : (
                            <span className={cls(v.p < 50 ? "font-bold text-coral-ink" : "text-ink", v.n < 5 && "opacity-60")}>
                              {v.p}%<span className="block text-[0.65rem] font-normal text-muted">n={v.n}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
