"use client";

import type { ResidentCtx } from "@/lib/context";
import { CfsDots, ScorePill, Trend } from "@/components/Score";
import { TrackChip } from "@/components/TrackChip";
import { FOLLOW_LABEL } from "@/lib/ui";
import { daysBetween } from "@/lib/rules";
import { type Cfg, autoCycle, expectedFor, historyBefore, latestScores, shortDate, standingFor } from "./helpers";

export function ContextPanel({ r, cfg, date, editingId }: { r: ResidentCtx; cfg: Cfg; date: string; editingId?: string }) {
  const hist = historyBefore(r, date, editingId);
  const recent = hist.slice(-3).reverse();
  const expected = expectedFor(r, cfg, date);
  const standing = standingFor(r, cfg, date);
  const latest = latestScores(hist);
  const last = hist[hist.length - 1];
  const cycle = autoCycle(r, cfg, date);
  const thisCycle = hist.filter((h) => h.cycle === cycle).length;
  const active = cfg.indicators.filter((i) => i.scored && (expected.has(i.code) || recent.some((h) => h.scores[i.code]?.score != null)));
  const observerName = (id: string) => cfg.observers.find((o) => o.id === id)?.name ?? id;
  const lastSteps = last?.steps ?? [];
  const obsAgo = (id: string) => hist.length - 1 - hist.findIndex((h) => h.id === id);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold">{r.name}</span>
          <TrackChip track={standing.track} name={standing.trackName} tier={standing.tier} />
        </div>
        <p className="text-muted">
          {[r.school, r.campus, r.gradeBand, r.content].filter(Boolean).join(" · ")}
          {r.mentor && <> · Mentor: {r.mentor}</>}
          {r.advisor && <> · Advisor: {r.advisor}</>}
        </p>
        <p className="mt-1">
          <b>{last ? `${daysBetween(last.date, date)} days` : "Never"}</b> since last observation · <b>{thisCycle}</b> this cycle (Cycle {cycle})
        </p>
      </div>

      <section aria-labelledby="ctx-recent">
        <h3 id="ctx-recent" className="font-bold text-teal-ink">Last {recent.length || ""} observations</h3>
        {recent.length === 0 ? (
          <p className="text-muted">No observations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-basic">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  {active.map((i) => (
                    <th key={i.code} scope="col" className="!px-1 text-center text-xs" title={i.name}>
                      {i.code.replace(/^C[CK]\./, "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((h, idx) => {
                  const older = recent[idx + 1];
                  return (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap">
                        <div className="font-semibold">{shortDate(h.date)}</div>
                        <div className="text-xs text-muted">{h.type} · {observerName(h.observer)}</div>
                      </td>
                      {active.map((i) => (
                        <td key={i.code} className="!px-1 text-center">
                          <span className="inline-flex items-center gap-0.5">
                            <ScorePill size="sm" score={h.scores[i.code]?.score} early={h.scores[i.code]?.early} />
                            <Trend prev={older?.scores[i.code]?.score} cur={h.scores[i.code]?.score} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="ctx-cfs">
        <h3 id="ctx-cfs" className="font-bold text-teal-ink">Look-fors (CFS) at last score</h3>
        <ul className="mt-1 space-y-1">
          {cfg.indicators.filter((i) => i.scored && expected.has(i.code)).map((i) => (
            <li key={i.code} className="flex items-center justify-between gap-2">
              <span title={i.name}>{i.code} <span className="text-muted">{i.short_label}</span></span>
              <CfsDots items={cfg.cfs.filter((c) => c.indicator === i.code)} demonstrated={latest[i.code]?.cfs ?? null} />
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">Filled = demonstrated, ring = not yet seen.</p>
      </section>

      <section aria-labelledby="ctx-steps">
        <h3 id="ctx-steps" className="font-bold text-teal-ink">Last action step{lastSteps.length > 1 ? "s" : ""}</h3>
        {lastSteps.length === 0 ? (
          <p className="text-muted">None yet.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {lastSteps.map((s) => (
              <li key={s.assignmentId} className="rounded-lg bg-coral-wash p-2">
                <span className="font-semibold">{s.indicator ? `${s.indicator}: ` : ""}</span>
                {s.text}
                <div className="text-xs text-muted">
                  Assigned {shortDate(last!.date)} ({obsAgo(last!.id) === 0 ? "last observation" : `${obsAgo(last!.id)} observations ago`})
                </div>
              </li>
            ))}
          </ul>
        )}
        {hist.length > 1 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-teal-ink">Earlier steps and follow-through</summary>
            <ul className="mt-1 space-y-1 text-xs">
              {hist.slice(0, -1).reverse().flatMap((h) =>
                h.steps.map((s) => {
                  const next = hist.find((x) => x.follow[s.assignmentId]);
                  return (
                    <li key={s.assignmentId}>
                      {shortDate(h.date)}: {s.text} {next ? <b>({FOLLOW_LABEL[next.follow[s.assignmentId]]})</b> : null}
                    </li>
                  );
                }),
              )}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="ctx-pri">
        <h3 id="ctx-pri" className="font-bold text-teal-ink">Open priorities</h3>
        {r.priorities.length === 0 ? (
          <p className="text-muted">None recorded. Add them on the resident page.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5">
            {r.priorities.map((p, i) => (
              <li key={i}>
                <span className="text-muted">C{p.cycle}{p.indicator ? ` · ${p.indicator}` : ""}:</span> {p.note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
