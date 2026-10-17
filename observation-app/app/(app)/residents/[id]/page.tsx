import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConfig, getResident, loadObservations, rulesForOne } from "@/lib/data";
import { sql } from "@/lib/db";
import { summarize } from "@/lib/summary";
import { cycleForDate, expectedIndicators, residentCycles } from "@/lib/rules";
import { formatDate, formatShort, todayISO } from "@/lib/dates";
import { FOLLOW_LABEL } from "@/lib/ui";
import { Flash } from "@/components/Flash";
import { ScorePill } from "@/components/Score";
import { TrackChip } from "@/components/TrackChip";
import { Trajectory } from "@/components/Trajectory";
import { addPriority, changeTrack, closePriority, saveResident, setCycleOverride, setIndicatorOverride } from "@/app/actions/residents";
import { ResidentFields } from "@/components/ResidentFields";

export const dynamic = "force-dynamic";

export default async function ResidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const r = await getResident(id);
  if (!r) notFound();
  const [cfg, obs, rules] = await Promise.all([getConfig(), loadObservations({ residentId: id }), rulesForOne(id)]);
  const today = todayISO();
  const s = summarize(r, obs, cfg, rules, today);
  const priorities = await sql<{ id: number; cycle: number; indicator: string | null; note: string; closed: boolean; created_by: string | null; created_at: string }[]>`
    select id, cycle, indicator, note, closed, created_by, created_at::date::text as created_at from resident_priorities where resident_id = ${id} order by closed, created_at desc`;
  const cycles = residentCycles(cfg.cycles, rules.cycleOverrides);
  const currentCycle = cycleForDate(today, cycles);
  const name = (o: string | null | undefined) => cfg.observers.find((x) => x.id === o)?.name ?? o ?? "";
  const advisorObserver = cfg.observers.find((o) => o.advisor_code === r.advisor_code);

  const points: Record<string, { date: string; score: number; early: boolean }[]> = {};
  const marks: Record<string, { date: string; label: string }[]> = {};
  for (const o of obs) {
    for (const sc of o.scores) if (sc.score) (points[sc.indicator] ??= []).push({ date: o.observed_date, score: sc.score, early: sc.expected_status === "early" });
    for (const st of o.steps) if (st.indicator) (marks[st.indicator] ??= []).push({ date: o.observed_date, label: st.wording_snapshot });
  }
  const shownInd = cfg.scoredIndicators.filter((i) => points[i.code] || s.expected.has(i.code));
  const allAssignments = obs.flatMap((o) => o.steps.map((st) => ({ ...st, date: o.observed_date })));
  const followFor = (aid: string) => obs.flatMap((o) => o.followthrough).find((f) => f.prior_assignment_id === aid);

  return (
    <div className="space-y-6">
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">{r.full_name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            <TrackChip track={s.standing.track} name={s.standing.trackName} tier={s.standing.tier} />
            <span>{[r.status, r.school, r.campus, r.grade_band, r.content, r.grade && `Grade ${r.grade}`].filter(Boolean).join(" · ")}</span>
          </p>
          <p className="text-sm text-muted">
            Advisor: <b>{r.advisor_code || "not set"}</b>{advisorObserver ? ` (${advisorObserver.name})` : ""} · Mentor: {r.mentor_teacher || "not set"} · Person ID {r.person_id}
            {r.is_sample && " · SAMPLE"}
          </p>
        </div>
        <Link className="btn-primary !min-h-10 !text-base" href={`/observe?resident=${r.id}`}>Observe {r.preferred_first || r.full_name.split(" ")[0]}</Link>
      </div>

      <section className="card" aria-labelledby="tr-h">
        <h2 id="tr-h" className="h3">Trajectory</h2>
        <p className="text-sm text-muted">Expected now (Cycle {currentCycle}): {[...s.expected].join(", ") || "none yet"}.</p>
        <div className="mt-3"><Trajectory cycles={cycles} indicators={shownInd} points={points} marks={marks} /></div>
      </section>

      <section className="card" aria-labelledby="hist-h">
        <h2 id="hist-h" className="h3">Observations ({obs.length})</h2>
        {obs.length === 0 ? <p className="text-muted">No observations yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="table-basic">
              <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Observer</th><th scope="col">C</th>{cfg.scoredIndicators.map((i) => <th key={i.code} scope="col" className="text-center text-xs" title={i.name}>{i.code}</th>)}</tr></thead>
              <tbody>
                {[...obs].reverse().map((o) => {
                  const exp = expectedIndicators(o.observed_date, cfg, rules);
                  return (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap"><Link className="link" href={`/observations/${o.id}`}>{formatShort(o.observed_date)}</Link></td>
                      <td>{o.type}</td><td>{name(o.observer_id)}</td><td>{o.cycle}</td>
                      {cfg.scoredIndicators.map((i) => {
                        const sc = o.scores.find((x) => x.indicator === i.code);
                        return (
                          <td key={i.code} className="text-center">
                            {sc?.score ? <ScorePill size="sm" score={sc.score} early={sc.expected_status === "early"} /> : exp.has(i.code) ? <span className="text-xs font-bold text-coral-ink" title="Expected but not scored">miss</span> : <span className="text-muted" title="Not expected yet">–</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="as-h">
        <h2 id="as-h" className="h3">Action steps and follow-through</h2>
        {allAssignments.length === 0 ? <p className="text-muted">None yet.</p> : (
          <ul className="mt-2 space-y-2">
            {[...allAssignments].reverse().map((a) => {
              const f = followFor(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-brand/20 pb-2">
                  <span><span className="text-xs text-muted">{formatShort(a.date)} · {a.step_id ?? (a.legacy_text ? "legacy text" : "typed")}{a.indicator ? ` · ${a.indicator}` : ""}</span><br />{a.wording_snapshot}</span>
                  <span className="chip border-gray-brand/40">{f ? FOLLOW_LABEL[f.result] : "Not yet checked"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="track-h">
          <h2 id="track-h" className="h3">Development track</h2>
          <p className="text-sm text-muted">The advisor decides. Either of you can record it. Changes can be backdated.</p>
          <form action={changeTrack} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="resident_id" value={r.id} />
            <label><span className="label text-sm">Track</span>
              <select name="track" className="input" defaultValue={s.standing.track}>
                {cfg.tracks.map((t) => <option key={t.code} value={t.code}>{t.name}{t.follows_calendar ? " (follows the calendar)" : ""}</option>)}
              </select>
            </label>
            <label><span className="label text-sm">Tier (Accelerated / Developing)</span>
              <select name="tier" className="input" defaultValue={String(s.standing.tier || 1)}>
                {cfg.tiers.map((t) => <option key={t.number} value={t.number}>{t.name}</option>)}
              </select>
            </label>
            <label><span className="label text-sm">Effective from</span><input type="date" name="effective_from" className="input" defaultValue={today} required /></label>
            <label><span className="label text-sm">Decided by</span>
              <select name="decided_by" className="input" defaultValue={advisorObserver?.id ?? me.id}>
                {cfg.observers.map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === advisorObserver?.id ? " (advisor)" : ""}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2"><span className="label text-sm">Reason</span><input name="reason" className="input" placeholder="e.g. All Tier 2 indicators at 3+ twice; promoted" required /></label>
            <div className="sm:col-span-2"><button className="btn-small">Record the change</button></div>
          </form>
          <h3 className="mt-5 font-bold">History</h3>
          {rules.tracks.length === 0 ? <p className="text-sm text-muted">Standard since the start (no changes recorded).</p> : (
            <ul className="mt-1 space-y-1 text-sm">
              {[...rules.tracks].reverse().map((t) => (
                <li key={t.id}>
                  <b>{formatDate(t.effective_from)}</b>: {t.previous_track ? `${cfg.tracks.find((x) => x.code === t.previous_track)?.name ?? t.previous_track}${t.previous_tier ? ` T${t.previous_tier}` : ""} → ` : ""}
                  {cfg.tracks.find((x) => x.code === t.track)?.name ?? t.track}{t.tier ? ` T${t.tier}` : ""}. {t.reason}{" "}
                  <span className="text-muted">(decided by {name(t.decided_by)}, recorded by {name(t.set_by)})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="pri-h">
          <h2 id="pri-h" className="h3">Priorities</h2>
          <form action={addPriority} className="mt-2 grid gap-2 sm:grid-cols-[6rem_8rem_1fr_auto]">
            <input type="hidden" name="resident_id" value={r.id} />
            <select name="cycle" className="input" defaultValue={currentCycle} aria-label="Cycle">{cfg.cycles.map((c) => <option key={c.number} value={c.number}>C{c.number}</option>)}</select>
            <select name="indicator" className="input" aria-label="Indicator"><option value="">Any</option>{cfg.indicators.map((i) => <option key={i.code}>{i.code}</option>)}</select>
            <input name="note" className="input" placeholder="Priority for this cycle" aria-label="Priority" />
            <button className="btn-small">Add</button>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {priorities.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2">
                <span className={p.closed ? "text-muted line-through" : ""}>C{p.cycle}{p.indicator ? ` · ${p.indicator}` : ""}: {p.note}</span>
                <form action={closePriority}><input type="hidden" name="priority_id" value={p.id} /><button className="link text-xs">{p.closed ? "Reopen" : "Close"}</button></form>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="ov-h">
          <h2 id="ov-h" className="h3">Indicator overrides</h2>
          <p className="text-sm text-muted">Turn one indicator on early or off for this resident, regardless of track.</p>
          <form action={setIndicatorOverride} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="resident_id" value={r.id} />
            <select name="indicator" className="input" aria-label="Indicator">{cfg.scoredIndicators.map((i) => <option key={i.code} value={i.code}>{i.code} {i.short_label}</option>)}</select>
            <select name="mode" className="input" aria-label="Mode"><option value="on">Turn on (expected)</option><option value="off">Turn off (not expected)</option><option value="clear">Clear override</option></select>
            <input type="date" name="effective_from" className="input" defaultValue={today} aria-label="Effective from" />
            <input name="reason" className="input" placeholder="Reason" aria-label="Reason" />
            <div><button className="btn-small">Save override</button></div>
          </form>
          {rules.overrides.length > 0 && (
            <ul className="mt-2 text-sm">{rules.overrides.map((o) => <li key={o.indicator}><b>{o.indicator}</b> {o.mode} from {formatShort(o.effective_from)}{o.reason ? `: ${o.reason}` : ""}</li>)}</ul>
          )}
        </section>

        <section className="card" aria-labelledby="cy-h">
          <h2 id="cy-h" className="h3">Custom cycle dates</h2>
          <p className="text-sm text-muted">For promoted residents on a different calendar. Leave alone to use the program dates.</p>
          <form action={setCycleOverride} className="mt-2 grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="resident_id" value={r.id} />
            <select name="cycle" className="input" aria-label="Cycle">{cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}</select>
            <input type="date" name="start_date" className="input" aria-label="Start" />
            <input type="date" name="end_date" className="input" aria-label="End" />
            <button className="btn-small">Save</button>
          </form>
          {rules.cycleOverrides.length > 0 && (
            <form action={setCycleOverride} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="resident_id" value={r.id} />
              <input type="hidden" name="clear" value="1" />
              <select name="cycle" className="rounded border px-1" aria-label="Cycle to reset">{rules.cycleOverrides.map((c) => <option key={c.cycle} value={c.cycle}>Cycle {c.cycle}</option>)}</select>
              <button className="link">Use the program dates again</button>
            </form>
          )}
          <ul className="mt-2 text-sm">
            {cycles.map((c) => {
              const o = rules.cycleOverrides.find((x) => x.cycle === c.number);
              return <li key={c.number} className={o ? "font-semibold" : "text-muted"}>Cycle {c.number}: {formatShort(c.start_date)} to {formatShort(c.end_date)}{o ? " (custom)" : ""}</li>;
            })}
          </ul>
        </section>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-bold">Edit roster details</summary>
        <form action={saveResident} className="mt-3">
          <input type="hidden" name="resident_id" value={r.id} />
          <ResidentFields r={r} />
          <button className="btn-small mt-3">Save</button>
        </form>
      </details>
    </div>
  );
}
