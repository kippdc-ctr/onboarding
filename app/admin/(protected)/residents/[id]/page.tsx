import Link from "next/link";
import { notFound } from "next/navigation";
import { FORMS, moduleActivities, moduleChecklistItems, moduleReflectionPrompts } from "@/lib/content";
import { decryptPin } from "@/lib/crypto";
import { displayName, getConfig, getResidentById, loadBundle } from "@/lib/data";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { accuracyText, ItemState, PHASE_TITLES, summarize } from "@/lib/progress";
import {
  adminSetChecked,
  resetPin,
  setChecklistVerified,
  setItemVerified,
  setResidentActive,
  unlockResident,
  updateResident,
} from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { PinCell } from "@/components/PinCell";
import { ResidentFields } from "@/components/ResidentFields";
import { StatusChip } from "@/components/StatusChip";
import { PRAXIS_STAGES } from "@/components/PraxisPanel";

export const dynamic = "force-dynamic";

function ItemRow({ rid, it }: { rid: string; it: ItemState }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-brand/20 py-2 last:border-0">
      <span>
        <strong>{it.item.label}</strong>
        <span className="ml-2 text-sm text-muted">Due {formatDate(it.due)}</span>
        {!it.visible && <span className="ml-2 text-sm text-muted">(hidden: Praxis exempt)</span>}
      </span>
      <span className="flex items-center gap-2">
        {it.verified ? (
          <span className="rounded bg-teal-ink px-2 py-0.5 text-sm font-bold text-white">✓ Verified</span>
        ) : it.checked ? (
          <span className="rounded bg-teal-wash px-2 py-0.5 text-sm font-bold text-teal-ink">✓ Self-reported</span>
        ) : (
          <span className="text-sm text-muted">Not done</span>
        )}
        {it.checked && (
          <form action={setItemVerified.bind(null, rid, it.item.id, !it.verified)}>
            <button className="btn-small !min-h-8 !px-3 text-sm">{it.verified ? "Clear verified" : "Mark verified"}</button>
          </form>
        )}
        <form action={adminSetChecked.bind(null, rid, `item:${it.item.id}`, !it.checked)}>
          <button className="link text-sm">{it.checked ? "Untick" : "Tick for them"}</button>
        </form>
      </span>
    </li>
  );
}

export default async function ResidentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await getResidentById(id);
  if (!r) notFound();
  const cfg = await getConfig(todayISO());
  const b = await loadBundle(r.id);
  const s = summarize(cfg, r, b);

  return (
    <div className="space-y-6">
      <p>
        <Link href="/admin" className="link">
          ← Completion grid
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1">{displayName(r)}</h1>
        {r.picker_label && <span className="text-muted">({r.picker_label})</span>}
        {!r.active && <span className="rounded bg-gray-brand px-2 py-0.5 text-sm font-bold text-white">Deactivated</span>}
        {r.is_sample && <span className="rounded bg-yellow px-2 py-0.5 text-sm font-bold">Sample</span>}
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <section className="card grid gap-4 md:grid-cols-3">
        <div>
          <h2 className="h3">Sign-in</h2>
          <p className="mt-2">
            PIN: <PinCell pin={decryptPin(r.pin_encrypted)} />
          </p>
          <p>
            Status:{" "}
            {r.locked ? <span className="rounded bg-coral px-2 font-bold text-white">Locked</span> : <span>Active</span>}
            {r.failed_pin_attempts > 0 && !r.locked && <span className="text-muted"> ({r.failed_pin_attempts} wrong attempts)</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.locked && (
              <form action={unlockResident.bind(null, r.id)}>
                <button className="btn-small">Unlock</button>
              </form>
            )}
            {r.pin_encrypted && (
              <form action={resetPin.bind(null, r.id)}>
                <button className="btn-small">Reset PIN</button>
              </form>
            )}
          </div>
        </div>
        <div>
          <h2 className="h3">Activity</h2>
          <p className="mt-2">Last active: {r.last_active_at ? formatDateTime(r.last_active_at) : "Never"}</p>
          <p>Added: {formatDate(r.added_on)}</p>
          <p>Cohort: {r.cohort_year}</p>
        </div>
        <div>
          <h2 className="h3">Praxis</h2>
          <p className="mt-2">Stage: {b.praxis?.stage ? `${b.praxis.stage}. ${PRAXIS_STAGES[b.praxis.stage - 1]}` : "Not loaded"}</p>
          <p>
            Math: {b.praxis?.math ?? "—"} · Reading: {b.praxis?.reading ?? "—"} · Writing: {b.praxis?.writing ?? "—"}
          </p>
          <p>Exempt: {r.praxis_exempt === null ? "Unknown" : r.praxis_exempt ? "Yes" : "No"}</p>
        </div>
      </section>

      <details className="card">
        <summary className="h3 cursor-pointer">Edit roster details</summary>
        <form action={updateResident.bind(null, r.id)} className="mt-4 space-y-4">
          <ResidentFields r={r} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
        <form action={setResidentActive.bind(null, r.id, !r.active)} className="mt-4">
          <button className={r.active ? "btn-danger" : "btn-small"}>{r.active ? "Deactivate (keeps data, hides from picker)" : "Reactivate"}</button>
        </form>
      </details>

      {([1, 3] as const).map((ph) => (
        <section key={ph} className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">
              Phase {ph}: {PHASE_TITLES[ph]}
            </h2>
            <StatusChip status={s.phases[ph - 1].status} />
          </div>
          <ul className="mt-2">
            {(ph === 1 ? s.phase1 : s.phase3).map((it) => (
              <ItemRow key={it.item.id} rid={r.id} it={it} />
            ))}
          </ul>
        </section>
      ))}

      <section className="card space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Phase 2: {PHASE_TITLES[2]}</h2>
          <StatusChip status={s.phases[1].status} />
        </div>
        {s.modules.map((m) => {
          const attempts = b.attempts.filter((a) => a.module_slug === m.slug);
          const items = moduleChecklistItems(m.content);
          return (
            <div key={m.slug} className="rounded-2xl border border-gray-brand/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="h3">
                  {m.content.number}. {m.content.title}
                </h3>
                <span className="flex items-center gap-3">
                  {m.totalQuestions > 0 && (
                    <span>
                      Accuracy <strong>{accuracyText(m)}</strong> · {m.attemptCount} attempt{m.attemptCount === 1 ? "" : "s"}
                    </span>
                  )}
                  <StatusChip status={m.status} />
                </span>
              </div>
              <p className="text-sm text-muted">
                Due {formatDate(m.due)}
                {m.completedAt && ` · Completed ${formatDateTime(m.completedAt)}`}
                {!m.completedAt && m.missing.length > 0 && ` · Still to do: ${m.missing.join("; ")}`}
                {!m.completedAt && m.ruleMet && " · Everything done; not yet marked complete"}
              </p>

              {items.length > 0 && (
                <ul className="mt-3">
                  {items.map((it) => {
                    const c = m.checklist[it.id];
                    return (
                      <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-brand/20 py-1.5 last:border-0">
                        <span>{it.label}</span>
                        <span className="flex items-center gap-2">
                          {c?.verified ? (
                            <span className="rounded bg-teal-ink px-2 text-sm font-bold text-white">✓ Verified</span>
                          ) : c?.checked ? (
                            <span className="rounded bg-teal-wash px-2 text-sm font-bold text-teal-ink">✓ Self-reported</span>
                          ) : (
                            <span className="text-sm text-muted">Not done</span>
                          )}
                          {c?.checked && (
                            <form action={setChecklistVerified.bind(null, r.id, m.slug, it.id, !c.verified)}>
                              <button className="btn-small !min-h-8 !px-3 text-sm">{c.verified ? "Clear verified" : "Mark verified"}</button>
                            </form>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {attempts.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold">Every quiz answer ({attempts.length})</summary>
                  <table className="mt-2 w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-brand/30">
                        <th className="p-1">Attempt</th>
                        <th className="p-1">Question</th>
                        <th className="p-1">Answer</th>
                        <th className="p-1">Result</th>
                        <th className="p-1">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a, i) => {
                        const qn = (m.content.quiz?.questions.findIndex((q) => q.id === a.question_id) ?? -1) + 1;
                        return (
                          <tr key={i} className="border-b border-gray-brand/10">
                            <td className="p-1">{a.attempt_no}</td>
                            <td className="p-1">Q{qn || "?"}</td>
                            <td className="p-1">{a.selected_option}</td>
                            <td className={`p-1 font-semibold ${a.is_correct ? "text-teal-ink" : "text-coral-ink"}`}>{a.is_correct ? "Correct" : "Incorrect"}</td>
                            <td className="p-1">{formatDateTime(a.attempted_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              )}

              {moduleReflectionPrompts(m.content).map((p) => {
                const rf = b.reflections.find((x) => x.prompt_id === p.promptId);
                return (
                  <div key={p.promptId} className="mt-3 rounded-xl bg-sand p-3">
                    <p className="font-semibold">{p.prompt}</p>
                    <p className="mt-1 whitespace-pre-wrap">{rf?.response_text?.trim() || <span className="text-muted">No response.</span>}</p>
                    {rf && <p className="text-xs text-muted">Saved {formatDateTime(rf.updated_at)}</p>}
                  </div>
                );
              })}

              {moduleActivities(m.content).map((a) => {
                const res = b.activities.find((x) => x.activity_id === a.activityId);
                const answers = ((res?.payload_json as { answers?: Record<string, string> })?.answers ?? {}) as Record<string, string>;
                return (
                  <div key={a.activityId} className="mt-3 rounded-xl bg-sand p-3">
                    <p className="font-semibold">
                      {a.type === "matching" ? a.title : "Scenario practice"}: {res?.completed_at ? "Finished" : res ? "In progress" : "Not started"}
                    </p>
                    {a.type === "scenario" &&
                      a.prompts.map((p) => (
                        <p key={p.id} className="mt-1">
                          <em>{p.prompt}</em> {answers[p.id] || <span className="text-muted">—</span>}
                        </p>
                      ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2 className="h2">In-app forms</h2>
        <ul className="mt-2">
          {FORMS.map((f) => {
            const fr = b.forms.find((x) => x.form_slug === f.slug);
            return (
              <li key={f.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{f.title}</strong>:{" "}
                  {fr ? (fr.status === "submitted" ? `Submitted ${formatDateTime(fr.submitted_at)}` : "Draft") : "Not started"}
                </span>
                {fr && (
                  <Link className="btn-small" href={`/admin/forms/${f.slug}/${r.id}`}>
                    View / edit
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
