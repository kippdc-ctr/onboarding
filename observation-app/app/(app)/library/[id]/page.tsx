import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConfig, getStep, type ActionStep } from "@/lib/data";
import { sql } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { Flash } from "@/components/Flash";
import { mergeStep, saveStep } from "@/app/actions/library";

export const dynamic = "force-dynamic";

export default async function StepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const cfg = await getConfig();
  const isNew = id === "new";
  const s: ActionStep | null = isNew ? null : await getStep(id);
  if (!isNew && !s) notFound();
  const history = s ? await sql<{ changed_at: string; changed_by: string | null; change: string }[]>`select changed_at::text, changed_by, change from action_step_history where step_id = ${s.id} order by changed_at desc` : [];
  const uses = s ? await sql<{ id: string; observed_date: string; full_name: string }[]>`
    select o.id, o.observed_date, r.full_name from observation_action_steps a join observations o on o.id = a.observation_id join residents r on r.id = o.resident_id
    where a.step_id = ${s.id} and o.deleted_at is null and o.status = 'submitted' order by o.observed_date desc limit 30` : [];
  const ro = !me.is_admin;
  const replacement = s?.replacement_id ? await getStep(s.replacement_id) : null;
  return (
    <div className="space-y-4">
      <Flash ok={sp.ok} error={sp.error} />
      <p><Link className="link text-sm" href="/library">← Library</Link></p>
      <h1 className="h1">{isNew ? "Add a library step" : `${s!.id}${s!.is_legacy ? " (legacy)" : ""}`}</h1>
      {s?.is_legacy && replacement && (
        <p className="rounded-xl bg-yellow-wash p-3 text-sm">Legacy wording kept so earlier observations stay readable. Suggested replacement: <Link className="link" href={`/library/${replacement.id}`}>{replacement.id}</Link> {replacement.text}</p>
      )}
      {s?.review_note && <p className="text-sm text-muted">Review note from the ratings sheet: {s.review_note}</p>}
      <form action={saveStep} className="card space-y-3">
        <input type="hidden" name="id" value={s?.id ?? ""} />
        <fieldset disabled={ro} className="space-y-3">
          <label className="block"><span className="label">Text sent to the resident</span><textarea name="text" className="input min-h-20" defaultValue={s?.text} required /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label><span className="label">Indicator</span>
              <select name="indicator" className="input" defaultValue={s?.indicator ?? ""} required><option value="">Choose…</option>{cfg.indicators.map((i) => <option key={i.code} value={i.code}>{i.code} {i.short_label}</option>)}</select>
            </label>
            <label><span className="label">Status</span>
              <select name="status" className="input" defaultValue={s?.status ?? "active"}><option value="active">Active (in the picker)</option><option value="draft">Draft</option><option value="retired">Retired</option></select>
            </label>
            <label><span className="label">Introduced in cycle</span>
              <select name="intro_cycle" className="input" defaultValue={s?.intro_cycle ?? ""}><option value="">Not set</option>{cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}</select>
            </label>
          </div>
          <fieldset>
            <legend className="label">Linked look-fors (CFS)</legend>
            <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="cross_cutting" defaultChecked={s?.link_type === "cross_cutting"} /> Cross-cutting (spans several look-fors; treated as an indicator-level step)</label>
            <div className="grid gap-1 sm:grid-cols-2">
              {cfg.cfs.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-sm" data-indicator={c.indicator}>
                  <input type="checkbox" name="cfs_ids" value={c.id} defaultChecked={s?.cfs_ids.includes(c.id)} className="mt-1" />
                  <span><b>{c.id}</b> {c.short_label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">Only look-fors that belong to the chosen indicator are kept.</p>
          </fieldset>
          <label className="block"><span className="label">What it looks like when it&apos;s working (look-fors; one per line)</span><textarea name="look_fors" className="input min-h-24" defaultValue={s?.look_fors} /></label>
          <label className="block"><span className="label">Practice this week (practice rep)</span><textarea name="practice_rep" className="input min-h-20" defaultValue={s?.practice_rep} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Resource link</span><input name="resource_url" type="url" className="input" defaultValue={s?.resource_url} /></label>
            <label><span className="label">Tags (comma separated)</span><input name="tags" className="input" defaultValue={s?.tags.join(", ")} /></label>
            <label><span className="label">Skill level</span><input name="skill_level" className="input" defaultValue={s?.skill_level} /></label>
            <label><span className="label">Grade band</span><input name="grade_band" className="input" defaultValue={s?.grade_band} /></label>
            <label><span className="label">Content area</span><input name="content_area" className="input" defaultValue={s?.content_area} /></label>
          </div>
        </fieldset>
        {ro ? <p className="text-sm text-muted">Only the admin can edit the library.</p> : <button className="btn-primary">{isNew ? "Add step" : "Save"}</button>}
      </form>

      {s && !ro && s.status !== "retired" && (
        <form action={mergeStep} className="card flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={s.id} />
          <label className="flex-1"><span className="label">Merge this duplicate into (step ID to keep)</span><input name="into" className="input" placeholder="AS-012" /></label>
          <button className="btn-danger">Merge and retire</button>
        </form>
      )}

      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="h3">Used in {uses.length}{uses.length === 30 ? "+" : ""} observations</h2>
            <ul className="mt-2 text-sm">{uses.map((u) => <li key={u.id}><Link className="link" href={`/observations/${u.id}`}>{u.observed_date}</Link> {u.full_name}</li>)}</ul>
          </section>
          <section className="card">
            <h2 className="h3">Edit history</h2>
            <ul className="mt-2 text-sm">{history.map((h, i) => <li key={i}>{formatDateTime(h.changed_at)}: {h.change} by {cfg.observers.find((o) => o.id === h.changed_by)?.name ?? h.changed_by}</li>)}</ul>
          </section>
        </div>
      )}
    </div>
  );
}
