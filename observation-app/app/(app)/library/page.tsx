import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { assignmentFacts, pct } from "@/lib/analytics";
import { cls } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; indicator?: string; status?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const facts = assignmentFacts(ds);
  const status = sp.status ?? "active";
  const q = (sp.q ?? "").toLowerCase();
  const steps = ds.steps
    .filter((s) => status === "all" || (status === "legacy" ? s.is_legacy : !s.is_legacy && s.status === status))
    .filter((s) => !sp.indicator || s.indicator === sp.indicator)
    .filter((s) => !q || `${s.id} ${s.text} ${s.look_fors} ${s.tags.join(" ")}`.toLowerCase().includes(q));
  const missing = ds.steps.filter((s) => s.status === "active" && (!s.look_fors || !s.practice_rep)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Action step library</h1>
          <p className="text-sm text-muted">{ds.steps.filter((s) => s.status === "active").length} active · {ds.steps.filter((s) => s.is_legacy).length} legacy (history only, never in the picker) · {missing} active steps still need look-fors or a practice rep.</p>
        </div>
        {me.is_admin && (
          <div className="flex gap-2">
            <Link className="btn-small" href="/library/new">Add a step</Link>
            <Link className="btn-small" href="/library/import">Bulk import</Link>
            <a className="btn-small" href="/export/library">Download CSV</a>
          </div>
        )}
      </div>
      <form className="card grid gap-2 !p-4 sm:grid-cols-4">
        <input name="q" defaultValue={sp.q} className="input" placeholder="Search" aria-label="Search" />
        <select name="indicator" defaultValue={sp.indicator ?? ""} className="input" aria-label="Indicator"><option value="">All indicators</option>{cfg.indicators.map((i) => <option key={i.code} value={i.code}>{i.code} {i.short_label}</option>)}</select>
        <select name="status" defaultValue={status} className="input" aria-label="Status">
          <option value="active">Active</option><option value="draft">Draft</option><option value="retired">Retired (not legacy)</option><option value="legacy">Legacy</option><option value="all">All</option>
        </select>
        <button className="btn-small">Filter</button>
      </form>
      <div className="card overflow-x-auto !p-0">
        <table className="table-basic">
          <thead><tr><th scope="col">ID</th><th scope="col">Indicator</th><th scope="col">Step</th><th scope="col">CFS link</th><th scope="col">Look-fors / practice</th><th scope="col">Used</th><th scope="col">Follow-through yes</th></tr></thead>
          <tbody>
            {steps.map((s) => {
              const f = facts.filter((x) => x.stepId === s.id);
              const checked = f.filter((x) => x.follow && x.follow !== "not_observed");
              return (
                <tr key={s.id} className={s.status !== "active" ? "text-muted" : ""}>
                  <td className="whitespace-nowrap"><Link className="link" href={`/library/${s.id}`}>{s.id}</Link>{s.status !== "active" && <div className="text-xs">{s.is_legacy ? "legacy" : s.status}</div>}</td>
                  <td>{s.indicator}</td>
                  <td className="min-w-72">{s.text}</td>
                  <td className="text-xs">{s.link_type === "cross_cutting" ? "Cross-cutting" : s.cfs_ids.join(", ")}</td>
                  <td className="text-xs"><span className={cls(!s.look_fors && "text-coral-ink")}>{s.look_fors ? "✓ look-fors" : "no look-fors"}</span><br /><span className={cls(!s.practice_rep && "text-coral-ink")}>{s.practice_rep ? "✓ practice" : "no practice rep"}</span></td>
                  <td className="text-center">{f.length}</td>
                  <td className="text-center">{pct(checked.filter((x) => x.follow === "yes").length, checked.length)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
