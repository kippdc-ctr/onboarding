import Link from "next/link";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/data";
import { sql } from "@/lib/db";
import { Flash } from "@/components/Flash";
import { deleteSamples, rotateAccess, rotateFeedToken, saveAccess, saveCalendar, saveGeneral, saveObservers, saveSchedule } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; rotated?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const cfg = await getConfig();
  const s = cfg.settings;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [samples] = await sql<{ n: number }[]>`select count(*)::int as n from residents where is_sample`;
  const ro = !me.is_admin;

  return (
    <div className="space-y-6">
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="h1">Settings</h1>
        <div className="flex gap-2">
          <Link className="btn-small" href="/settings/import">Import roster / observations</Link>
          <Link className="btn-small" href="/settings/audit">Audit log</Link>
        </div>
      </div>
      {ro && <p className="rounded-xl bg-yellow-wash p-3 text-sm">You can view settings; only the admin ({cfg.observers.filter((o) => o.is_admin).map((o) => o.name).join(", ")}) can change them.</p>}

      {sp.rotated && (
        <div role="status" className="rounded-xl border-2 border-teal bg-teal-wash p-4">
          <p className="font-bold">New private link (old link and passcode no longer work):</p>
          <p className="mt-1 break-all font-mono text-sm">{origin}/enter/{s.access_key}</p>
          <p className="mt-1 text-sm">Send it to Alison directly (not in a group email or chat), with the new passcode. This device stays signed in.</p>
        </div>
      )}

      <form action={saveGeneral} className="card space-y-3">
        <fieldset disabled={ro} className="space-y-3">
          <h2 className="h3">Scoring screen and email</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label><span className="label text-sm">Observation types (one per line)</span><textarea name="observation_types" className="input min-h-36" defaultValue={s.observation_types} /></label>
            <label><span className="label text-sm">Levels of involvement</span><textarea name="involvement_levels" className="input min-h-36" defaultValue={s.involvement_levels} /></label>
            <label><span className="label text-sm">Campuses (one-pagers)</span><textarea name="campuses" className="input min-h-36" defaultValue={s.campuses} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <label><span className="label text-sm">Max action steps</span><input name="max_action_steps" type="number" min={1} max={5} className="input" defaultValue={s.max_action_steps} /></label>
            <label><span className="label text-sm">Edit window (days)</span><input name="edit_window_days" type="number" min={0} className="input" defaultValue={s.edit_window_days} /></label>
            <label><span className="label text-sm">Expected obs per resident per cycle</span><input name="expected_obs_per_cycle" type="number" min={0} className="input" defaultValue={s.expected_obs_per_cycle} /></label>
            <label><span className="label text-sm">Advance: score at least</span><input name="advance_threshold" type="number" step="0.5" min={1} max={4} className="input" defaultValue={s.advance_threshold} /></label>
            <label><span className="label text-sm">Advance: in the last N observations</span><input name="advance_observations" type="number" min={1} className="input" defaultValue={s.advance_observations} /></label>
          </div>
          <label className="block"><span className="label text-sm">Rubric note (scoring screen and email)</span><input name="rubric_note" className="input" defaultValue={s.rubric_note} /></label>
          <label className="block"><span className="label text-sm">Default &quot;What happens next&quot; text</span><textarea name="email_next_steps" className="input" defaultValue={s.email_next_steps} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="email_snapshot_default" defaultChecked={s.email_snapshot_default !== "false"} /> Include the indicator snapshot in emails by default</label>
          {!ro && <button className="btn-small">Save</button>}
        </fieldset>
      </form>

      <form action={saveCalendar} className="card space-y-3" id="calendar">
        <fieldset disabled={ro} className="space-y-3">
          <h2 className="h3">Cycle calendar</h2>
          <p className="text-sm text-muted">Observations are assigned to a cycle from their date. Dates between cycles count toward the cycle that most recently ended (the observer can override).</p>
          <div className="overflow-x-auto">
            <table className="table-basic">
              <thead><tr><th scope="col">Cycle</th><th scope="col">Theme</th><th scope="col">Start</th><th scope="col">End</th></tr></thead>
              <tbody>
                {cfg.cycles.map((c) => (
                  <tr key={c.number}>
                    <td>{c.number}</td>
                    <td><input name={`theme_${c.number}`} className="input" defaultValue={c.theme} aria-label={`Cycle ${c.number} theme`} /></td>
                    <td><input type="date" name={`start_${c.number}`} className="input" defaultValue={c.start_date} aria-label={`Cycle ${c.number} start`} /></td>
                    <td><input type="date" name={`end_${c.number}`} className="input" defaultValue={c.end_date} aria-label={`Cycle ${c.number} end`} /></td>
                  </tr>
                ))}
                <tr>
                  <td><input name="new_number" type="number" className="input w-20" placeholder="New" aria-label="New cycle number" /></td>
                  <td><input name="new_theme" className="input" placeholder="Add a cycle (optional)" aria-label="New cycle theme" /></td>
                  <td><input type="date" name="new_start" className="input" aria-label="New cycle start" /></td>
                  <td><input type="date" name="new_end" className="input" aria-label="New cycle end" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          {!ro && <button className="btn-small">Save calendar</button>}
        </fieldset>
      </form>

      <form action={saveSchedule} className="card space-y-3" id="schedule">
        <fieldset disabled={ro} className="space-y-3">
          <h2 className="h3">Indicator schedule and tiers</h2>
          <p className="text-sm text-muted">
            Standard residents are expected on an indicator from the start date of its <b>first-scored cycle</b>. Accelerated and Developing residents are expected on every indicator
            whose <b>tier</b> is at or below their tier. Uncheck &quot;Scored&quot; for library-only indicators (CC.P.3 this year).
          </p>
          <div className="overflow-x-auto">
            <table className="table-basic">
              <thead><tr><th scope="col">Indicator</th><th scope="col">Name</th><th scope="col">Scored</th><th scope="col">Introduced</th><th scope="col">First scored</th><th scope="col">Tier</th></tr></thead>
              <tbody>
                {cfg.indicators.map((i) => (
                  <tr key={i.code}>
                    <td className="font-bold">{i.code}</td>
                    <td><input name={`name_${i.code}`} className="input min-w-64" defaultValue={i.name} aria-label={`${i.code} name`} /></td>
                    <td className="text-center"><input type="checkbox" name={`scored_${i.code}`} defaultChecked={i.scored} aria-label={`${i.code} scored`} /></td>
                    {(["intro", "first"] as const).map((k) => (
                      <td key={k}>
                        <select name={`${k}_${i.code}`} className="input" defaultValue={String((k === "intro" ? i.introduced_cycle : i.first_scored_cycle) ?? "")} aria-label={`${i.code} ${k === "intro" ? "introduced" : "first scored"} cycle`}>
                          <option value="">–</option>{cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}
                        </select>
                      </td>
                    ))}
                    <td>
                      <select name={`tier_${i.code}`} className="input" defaultValue={String(i.tier ?? "")} aria-label={`${i.code} tier`}>
                        <option value="">–</option>{cfg.tiers.map((t) => <option key={t.number} value={t.number}>Tier {t.number}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="font-bold">Tiers</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {cfg.tiers.map((t) => (
              <div key={t.number} className="flex items-center gap-2">
                <input name={`tiername_${t.number}`} className="input" defaultValue={t.name} aria-label={`Tier ${t.number} name`} />
                <label className="whitespace-nowrap text-sm">Standard from
                  <select name={`tiercycle_${t.number}`} className="ml-1 rounded border px-1" defaultValue={t.calendar_cycle}>{cfg.cycles.map((c) => <option key={c.number} value={c.number}>C{c.number}</option>)}</select>
                </label>
              </div>
            ))}
          </div>
          <h3 className="font-bold">Tracks</h3>
          <p className="text-sm">{cfg.tracks.map((t) => `${t.name}${t.follows_calendar ? " (follows the calendar)" : " (tier set by hand)"}`).join(" · ")}</p>
          <label className="block max-w-sm"><span className="label text-sm">Add a track</span><input name="new_track" className="input" placeholder="e.g. Senior Resident" /></label>
          {!ro && <button className="btn-small">Save schedule</button>}
        </fieldset>
      </form>

      <form action={saveObservers} className="card space-y-3" id="observers">
        <fieldset disabled={ro} className="space-y-3">
          <h2 className="h3">Observers</h2>
          <p className="text-sm text-muted">The advisor code links each observer to the Advisor column on the roster.</p>
          {cfg.observers.map((o) => (
            <div key={o.id} className="grid gap-2 sm:grid-cols-5">
              <input name={`name_${o.id}`} className="input" defaultValue={o.name} aria-label="Short name" />
              <input name={`full_${o.id}`} className="input" defaultValue={o.full_name} placeholder="Full name (email sign-off)" aria-label="Full name" />
              <input name={`code_${o.id}`} className="input" defaultValue={o.advisor_code} placeholder="Advisor code" aria-label="Advisor code" />
              <input name={`email_${o.id}`} className="input" defaultValue={o.email} placeholder="Email" aria-label="Email" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`admin_${o.id}`} defaultChecked={o.is_admin} disabled={o.id === me.id} /> Admin</label>
            </div>
          ))}
          {!ro && <button className="btn-small">Save observers</button>}
        </fieldset>
      </form>

      <section className="card space-y-4" id="access">
        <h2 className="h3">Access</h2>
        <p className="text-sm">
          The app opens only from the private link. Never paste it into a group email or chat.{" "}
          {me.is_admin && <>Current link: <span className="break-all font-mono text-xs">{origin}/enter/{s.access_key}</span></>}
        </p>
        <form action={saveAccess} className="space-y-2">
          <fieldset disabled={ro} className="space-y-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="passcode_enabled" defaultChecked={s.passcode_enabled !== "false"} /> Require the shared passcode (recommended)</label>
            <p className="text-xs text-coral-ink">With the passcode off, anyone who gets the link can read resident performance data.</p>
            <label className="block max-w-sm"><span className="label text-sm">Change the passcode (optional)</span><input name="new_passcode" type="password" autoComplete="new-password" className="input" /></label>
            {!ro && <button className="btn-small">Save access</button>}
          </fieldset>
        </form>
        {!ro && (
          <form action={rotateAccess} className="space-y-2 rounded-xl bg-coral-wash p-3">
            <p className="font-semibold">Rotate the link and passcode</p>
            <p className="text-sm">Every other device is signed out. You&apos;ll see the new link here.</p>
            <label className="block max-w-sm"><span className="label text-sm">New passcode</span><input name="rotate_passcode" type="password" autoComplete="new-password" className="input" required /></label>
            <button className="btn-danger">Rotate link and passcode</button>
          </form>
        )}
      </section>

      <section className="card space-y-2" id="feed">
        <h2 className="h3">Data feed for the Program Metrics App</h2>
        <p className="text-sm">Read-only JSON or CSV. Datasets: <code>scores</code>, <code>steps</code>, <code>followthrough</code>, <code>tracks</code>, <code>residents</code>, <code>indicators</code>, <code>cfs</code>, <code>cycles</code>, <code>library</code>. Add <code>&amp;format=csv</code> for CSV.</p>
        {me.is_admin ? (
          <>
            <p className="break-all font-mono text-xs">{origin}/api/feed?dataset=scores&amp;token={s.feed_token}</p>
            <p className="text-xs text-muted">Or send the token as a header: <code>Authorization: Bearer &lt;token&gt;</code>.</p>
            <form action={rotateFeedToken}><button className="btn-small">Make a new token</button></form>
          </>
        ) : <p className="text-sm text-muted">Ask the admin for the feed token.</p>}
        <p className="text-sm">CSV downloads: <a className="link" href="/export/scores">scores</a> · <a className="link" href="/export/steps">action steps</a> · <a className="link" href="/export/followthrough">follow-through</a> · <a className="link" href="/export/tracks">tracks</a> · <a className="link" href="/export/residents">residents</a> · <a className="link" href="/export/library">library</a> · <a className="link" href="/export/backup">full backup (JSON)</a></p>
      </section>

      <section className="card space-y-2" id="data">
        <h2 className="h3">Sample data</h2>
        {samples.n === 0 ? <p className="text-sm text-muted">No sample residents.</p> : (
          <form action={deleteSamples} className="flex flex-wrap items-end gap-2">
            <p className="w-full text-sm">{samples.n} fake &quot;Sample&quot; residents (and their observations) are in the app for testing. Delete them before launch.</p>
            <label><span className="label text-sm">Type DELETE SAMPLES</span><input name="confirm" className="input" autoComplete="off" /></label>
            <button className="btn-danger" disabled={ro}>Delete sample data</button>
          </form>
        )}
      </section>
    </div>
  );
}
