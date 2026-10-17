import "server-only";
import type { Dataset } from "./data";
import { average } from "./rules";

export type AssignmentFact = {
  assignmentId: string;
  residentId: string;
  observationId: string;
  date: string;
  cycle: number;
  observer: string;
  stepId: string | null;
  text: string;
  indicator: string | null;
  base: number | null; // target-indicator score at (or before) the assigning observation
  next: number | null; // target-indicator score at the next observation that scored it
  delta: number | null;
  follow: string | null; // result recorded at the next observation
};

/** One fact per assigned action step, with the score change on its target indicator and the follow-through result. */
export function assignmentFacts(ds: Dataset): AssignmentFact[] {
  const out: AssignmentFact[] = [];
  for (const [rid, obs] of ds.byResident) {
    obs.forEach((o, i) => {
      for (const a of o.steps) {
        const ind = a.indicator;
        let base: number | null = null;
        if (ind) {
          for (let k = i; k >= 0 && base === null; k--) base = obs[k].scores.find((s) => s.indicator === ind && s.score)?.score ?? null;
        }
        let next: number | null = null;
        if (ind) {
          for (let k = i + 1; k < obs.length && next === null; k++) next = obs[k].scores.find((s) => s.indicator === ind && s.score)?.score ?? null;
        }
        const follow = obs.slice(i + 1).flatMap((x) => x.followthrough).find((f) => f.prior_assignment_id === a.id)?.result ?? null;
        out.push({
          assignmentId: a.id, residentId: rid, observationId: o.id, date: o.observed_date, cycle: o.cycle, observer: o.observer_id,
          stepId: a.step_id, text: a.wording_snapshot, indicator: ind, base, next,
          delta: base !== null && next !== null ? next - base : null, follow,
        });
      }
    });
  }
  return out;
}

export function avgDelta(facts: AssignmentFact[]): { avg: number | null; n: number } {
  const d = facts.map((f) => f.delta).filter((x): x is number => x !== null);
  return { avg: average(d), n: d.length };
}

export function pct(n: number, d: number): string {
  return d ? `${Math.round((100 * n) / d)}%` : "–";
}
