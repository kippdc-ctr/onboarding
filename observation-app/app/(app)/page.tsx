import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listDrafts, loadDataset, setting } from "@/lib/data";
import { summarize } from "@/lib/summary";
import { cycleForDate } from "@/lib/rules";
import { formatShort, todayISO } from "@/lib/dates";
import { Flash } from "@/components/Flash";
import { TrackChip } from "@/components/TrackChip";
import { ScorePill } from "@/components/Score";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ queued?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const ds = await loadDataset();
  const { cfg } = ds;
  const cycle = cycleForDate(today, cfg.cycles);
  const cyc = cfg.cycles.find((c) => c.number === cycle);
  const drafts = await listDrafts(me.id);
  const active = ds.residents.filter((r) => r.active);
  const sums = active.map((r) => summarize(r, ds.byResident.get(r.id) ?? [], cfg, ds.rules.get(r.id)!, today));
  const notObserved = sums.filter((s) => s.obsThisCycle === 0).sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));
  const unsent = ds.observations.filter((o) => o.send_flag && !o.sent_at && o.observer_id === me.id).reverse().slice(0, 10);
  const recent = [...ds.observations].reverse().slice(0, 8);
  const name = (id: string) => ds.residents.find((r) => r.id === id)?.full_name ?? "";
  const expectedPer = setting(cfg, "expected_obs_per_cycle", 3);
  const mine = active.filter((r) => r.advisor_code === me.advisor_code);
  const myDone = ds.observations.filter((o) => o.cycle === cycle && o.observer_id === me.id).length;

  return (
    <div className="space-y-6">
      <Flash ok={sp.queued ? "Saved on this device. It will send automatically when you're back online." : undefined} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Hi, {me.name}</h1>
          <p className="text-muted">
            Today is in <b>Cycle {cycle}{cyc ? `: ${cyc.theme}` : ""}</b>{cyc ? ` (${formatShort(cyc.start_date)} to ${formatShort(cyc.end_date)})` : ""}.
          </p>
        </div>
        <Link href="/observe" className="btn-primary">Start an observation</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card !p-4">
          <p className="text-sm text-muted">Your observations this cycle</p>
          <p className="text-3xl font-bold text-teal-ink">{myDone}<span className="text-base font-semibold text-muted"> / {mine.length * expectedPer} expected</span></p>
          <p className="text-xs text-muted">{mine.length} advisees × {expectedPer} per cycle</p>
        </div>
        <div className="card !p-4">
          <p className="text-sm text-muted">Residents not yet observed this cycle</p>
          <p className="text-3xl font-bold text-teal-ink">{notObserved.length}<span className="text-base font-semibold text-muted"> of {active.length}</span></p>
        </div>
        <div className="card !p-4">
          <p className="text-sm text-muted">Your emails not marked sent</p>
          <p className="text-3xl font-bold text-teal-ink">{unsent.length}</p>
        </div>
      </div>

      {drafts.length > 0 && (
        <section className="card" aria-labelledby="dr-h">
          <h2 id="dr-h" className="h3">Your saved drafts</h2>
          <ul className="mt-2 divide-y divide-gray-brand/20">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span>{d.resident_name} · {formatShort(d.observed_date)}</span>
                <Link className="btn-small" href={`/observe?draft=${d.id}`}>Continue</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="no-h">
          <h2 id="no-h" className="h3">Not yet observed this cycle</h2>
          {notObserved.length === 0 ? <p className="mt-2 text-muted">Everyone has been observed this cycle.</p> : (
            <ul className="mt-2 divide-y divide-gray-brand/20">
              {notObserved.slice(0, 15).map((s) => (
                <li key={s.resident.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link className="font-semibold hover:underline" href={`/residents/${s.resident.id}`}>{s.resident.full_name}</Link>{" "}
                    <TrackChip track={s.standing.track} name={s.standing.trackName} />
                    <span className="block text-xs text-muted">{s.resident.campus} · advisor {s.resident.advisor_code || "?"} · {s.daysSince === null ? "never observed" : `${s.daysSince} days since last`}</span>
                  </span>
                  <Link className="btn-small" href={`/observe?resident=${s.resident.id}`}>Observe</Link>
                </li>
              ))}
            </ul>
          )}
          {notObserved.length > 15 && <Link className="link mt-2 inline-block text-sm" href="/dashboards/pace">See all {notObserved.length}</Link>}
        </section>

        <section className="card" aria-labelledby="re-h">
          <h2 id="re-h" className="h3">Recent observations</h2>
          {recent.length === 0 ? <p className="mt-2 text-muted">None yet.</p> : (
            <ul className="mt-2 divide-y divide-gray-brand/20">
              {recent.map((o) => (
                <li key={o.id} className="py-2">
                  <Link className="flex flex-wrap items-center justify-between gap-2 hover:underline" href={`/observations/${o.id}`}>
                    <span><b>{name(o.resident_id)}</b> <span className="text-sm text-muted">{formatShort(o.observed_date)} · {o.type} · {cfg.observers.find((x) => x.id === o.observer_id)?.name}</span></span>
                    <span className="flex gap-1">{o.scores.filter((s) => s.score).slice(0, 6).map((s) => <ScorePill key={s.indicator} size="sm" score={s.score} early={s.expected_status === "early"} />)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {unsent.length > 0 && (
            <>
              <h3 className="mt-4 font-bold">Emails to send</h3>
              <ul className="mt-1 text-sm">
                {unsent.map((o) => <li key={o.id}><Link className="link" href={`/observations/${o.id}`}>{name(o.resident_id)} · {formatShort(o.observed_date)}</Link></li>)}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
