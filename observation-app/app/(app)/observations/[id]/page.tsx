import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConfig, getObservation, getResident, listSteps, loadObservations } from "@/lib/data";
import { canEdit } from "@/lib/save";
import { emailFor } from "@/lib/obsEmail";
import { formatDate, formatDateTime } from "@/lib/dates";
import { FOLLOW_LABEL } from "@/lib/ui";
import { SCORE_LABELS } from "@/lib/rules";
import { CfsDots, ScorePill } from "@/components/Score";
import { CopyEmail } from "@/components/CopyEmail";
import { Flash } from "@/components/Flash";
import { deleteObservation, markSent, promoteCustomStep } from "@/app/actions/observations";

export const dynamic = "force-dynamic";

export default async function ObservationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; ok?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const o = await getObservation(id);
  if (!o) notFound();
  const [cfg, r, steps] = await Promise.all([getConfig(), getResident(o.resident_id), listSteps({ includeRetired: true })]);
  if (!r) notFound();
  const editable = canEdit(o, me, Number(cfg.settings.edit_window_days) || 7);
  const email = emailFor(o, r, cfg, steps);
  const observer = cfg.observers.find((x) => x.id === o.observer_id);
  // Prior assignments this observation recorded follow-through on.
  const prior = o.followthrough.length ? (await loadObservations({ residentId: o.resident_id })).flatMap((x) => x.steps) : [];

  if (o.status === "draft") {
    return (
      <div className="card">
        <h1 className="h2">Draft for {r.full_name}</h1>
        <p className="mt-2">This observation hasn't been submitted.</p>
        <Link className="btn-primary mt-4" href={`/observe?draft=${o.id}`}>Continue the draft</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Flash ok={sp.saved ? "Observation submitted." : sp.ok} error={sp.error} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">
            <Link href={`/residents/${r.id}`} className="hover:underline">{r.full_name}</Link>
          </h1>
          <p className="text-muted">
            {formatDate(o.observed_date, { weekday: true })} · {o.type} · {o.involvement || "Involvement not set"} · {observer?.name} · Cycle {o.cycle}
            {o.cycle_overridden && " (set by observer)"}
            {o.source === "import" && " · Imported from Fillout"}
          </p>
        </div>
        {editable && <Link className="btn-secondary !min-h-10 !text-base" href={`/observations/${o.id}/edit`}>Edit</Link>}
      </div>

      <section className="card" aria-labelledby="sc-h">
        <h2 id="sc-h" className="h3">Scores</h2>
        {o.scores.length === 0 ? <p className="text-muted">No scores recorded.</p> : (
          <div className="overflow-x-auto">
            <table className="table-basic mt-2">
              <thead><tr><th scope="col">Indicator</th><th scope="col">Score</th><th scope="col">Look-fors (CFS)</th><th scope="col">Comment</th></tr></thead>
              <tbody>
                {cfg.indicators.filter((i) => o.scores.some((s) => s.indicator === i.code)).map((i) => {
                  const s = o.scores.find((x) => x.indicator === i.code)!;
                  const items = cfg.cfs.filter((c) => c.indicator === i.code);
                  return (
                    <tr key={i.code}>
                      <td><b>{i.code}</b> {i.short_label}{s.expected_status === "early" && <div className="text-xs text-muted">Extra / early, not counted</div>}</td>
                      <td className="whitespace-nowrap"><ScorePill score={s.score} early={s.expected_status === "early"} /> <span className="text-xs text-muted">{s.score ? SCORE_LABELS[s.score] : ""}</span></td>
                      <td>
                        <CfsDots items={items} demonstrated={s.cfs_demonstrated} />
                        <ul className="mt-1 text-xs text-muted">{items.filter((c) => s.cfs_demonstrated.includes(c.id)).map((c) => <li key={c.id}>✓ {c.short_label}</li>)}</ul>
                      </td>
                      <td>{s.comment}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {o.followthrough.length > 0 && (
        <section className="card" aria-labelledby="ft-h">
          <h2 id="ft-h" className="h3">Follow-through on the previous step</h2>
          <ul className="mt-2 space-y-1">
            {o.followthrough.map((f) => (
              <li key={f.prior_assignment_id}>
                <b>{FOLLOW_LABEL[f.result]}</b>: {prior.find((p) => p.id === f.prior_assignment_id)?.wording_snapshot ?? "(step)"}
                {f.note && <span className="text-muted"> · {f.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="as-h">
        <h2 id="as-h" className="h3">Action step{o.steps.length > 1 ? "s" : ""}</h2>
        <ul className="mt-2 space-y-3">
          {o.steps.map((s) => {
            const st = s.step_id ? steps.find((x) => x.id === s.step_id) : null;
            return (
              <li key={s.id} className="rounded-xl border-l-4 border-coral bg-coral-wash p-3">
                <p className="text-xs font-semibold text-coral-ink">
                  {st ? <Link className="underline" href={`/library/${st.id}`}>{st.id}</Link> : s.legacy_text ? "Legacy text (imported, not matched to the library)" : "Typed step"}
                  {st?.is_legacy && " · legacy"}
                  {s.indicator && ` · ${s.indicator}`}
                </p>
                <p className="font-semibold">{s.wording_snapshot}</p>
                {s.personalization_note && <p className="text-sm italic">{s.personalization_note}</p>}
                {!s.step_id && !s.legacy_text && (
                  s.promoted_step_id ? (
                    <p className="mt-1 text-sm">Added to the library as <Link className="link" href={`/library/${s.promoted_step_id}`}>{s.promoted_step_id}</Link>.</p>
                  ) : (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-teal-ink">Add to library</summary>
                      <form action={promoteCustomStep} className="mt-2 space-y-2">
                        <input type="hidden" name="assignment_id" value={s.id} />
                        <label className="label text-sm" htmlFor={`t-${s.id}`}>Step text</label>
                        <textarea id={`t-${s.id}`} name="text" className="input" defaultValue={s.custom_text ?? ""} />
                        <label className="label text-sm" htmlFor={`i-${s.id}`}>Indicator</label>
                        <select id={`i-${s.id}`} name="indicator" className="input" defaultValue={s.indicator ?? ""} required>
                          <option value="">Choose…</option>
                          {cfg.indicators.map((i) => <option key={i.code} value={i.code}>{i.code} {i.short_label}</option>)}
                        </select>
                        <label className="label text-sm" htmlFor={`l-${s.id}`}>Look-fors</label>
                        <textarea id={`l-${s.id}`} name="look_fors" className="input" defaultValue={s.custom_look_fors} />
                        <label className="label text-sm" htmlFor={`p-${s.id}`}>Practice rep</label>
                        <textarea id={`p-${s.id}`} name="practice_rep" className="input" defaultValue={s.custom_practice} />
                        <button className="btn-small">Add as a Draft library step</button>
                      </form>
                    </details>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="fb-h">
        <h2 id="fb-h" className="h3">Feedback</h2>
        <dl className="mt-2 space-y-3">
          <div><dt className="font-semibold">Affirming</dt><dd className="whitespace-pre-wrap">{o.affirming || <span className="text-muted">None</span>}</dd></div>
          <div><dt className="font-semibold">Adjusting</dt><dd className="whitespace-pre-wrap">{o.adjusting || <span className="text-muted">None</span>}</dd></div>
          <div><dt className="font-semibold">Internal comments (private)</dt><dd className="whitespace-pre-wrap">{o.internal_comments || <span className="text-muted">None</span>}</dd></div>
        </dl>
      </section>

      {o.send_flag ? (
        <section className="card" aria-labelledby="em-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="em-h" className="h3">Resident email</h2>
            <form action={markSent}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="sent" value={o.sent_at ? "0" : "1"} />
              {o.sent_at ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="chip border-teal bg-teal-wash text-teal-ink">Sent {formatDateTime(o.sent_at)}{o.sent_by ? ` by ${cfg.observers.find((x) => x.id === o.sent_by)?.name}` : ""}</span>
                  <button className="link text-sm">Undo</button>
                </span>
              ) : (
                <button className="btn-small">Mark as sent</button>
              )}
            </form>
          </div>
          <p className="mt-2 text-sm"><b>To:</b> {r.email || <span className="text-coral-ink">No email on the roster</span>} · <b>Subject:</b> {email.subject}</p>
          <div className="mt-3"><CopyEmail html={email.html} text={email.text} subject={email.subject} to={r.email} /></div>
          <div className="mt-3 rounded-xl border border-gray-brand/30 bg-white p-4" dangerouslySetInnerHTML={{ __html: email.html }} />
        </section>
      ) : (
        <p className="text-muted">Not sent to the resident (the Send toggle was off).</p>
      )}

      {editable && (
        <details className="card">
          <summary className="cursor-pointer font-semibold text-coral-ink">Delete this observation</summary>
          <form action={deleteObservation} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={o.id} />
            <label className="flex-1">
              <span className="label text-sm">Type DELETE to confirm</span>
              <input name="confirm" className="input" autoComplete="off" />
            </label>
            <button className="btn-danger">Delete</button>
          </form>
        </details>
      )}
    </div>
  );
}
