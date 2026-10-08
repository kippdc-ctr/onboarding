import "server-only";
import type { Config, Observation, Resident } from "./data";
import { average, cycleForDate, daysBetween, expectedIndicators, residentCycles, standingAt, type ResidentRules, type Standing } from "./rules";

export type Latest = { score: number | null; early: boolean; cfs: string[]; date: string; obsId: string };

/** Latest scored value per indicator (observations are oldest first). */
export function latestByIndicator(obs: Observation[], onOrBefore?: string): Map<string, Latest> {
  const m = new Map<string, Latest>();
  for (const o of obs) {
    if (onOrBefore && o.observed_date > onOrBefore) continue;
    for (const s of o.scores) {
      if (s.score === null) continue;
      m.set(s.indicator, { score: s.score, early: s.expected_status === "early", cfs: s.cfs_demonstrated, date: o.observed_date, obsId: o.id });
    }
  }
  return m;
}

export const AREAS = ["Learning Environment", "Intellectual Prep", "Responsive Instruction"] as const;

export type ResidentSummary = {
  resident: Resident;
  standing: Standing;
  expected: Set<string>;
  latest: Map<string, Latest>;
  areaAvg: Record<string, number | null>;
  lastObs: Observation | null;
  daysSince: number | null;
  obsThisCycle: number;
  currentCycle: number;
  cyclesDone: Record<number, boolean>;
  missing: string[]; // expected indicators with no expected-status score yet
};

export function summarize(r: Resident, obs: Observation[], cfg: Config, rules: ResidentRules, today: string): ResidentSummary {
  const cycles = residentCycles(cfg.cycles, rules.cycleOverrides);
  const currentCycle = cycleForDate(today, cycles);
  const expected = expectedIndicators(today, cfg, rules);
  const latest = latestByIndicator(obs, today);
  const areaAvg: Record<string, number | null> = {};
  for (const area of AREAS) {
    const codes = cfg.scoredIndicators.filter((i) => i.area === area).map((i) => i.code);
    areaAvg[area] = average(codes.map((c) => (latest.get(c) && !latest.get(c)!.early ? latest.get(c)!.score : null)));
  }
  const lastObs = obs.length ? obs[obs.length - 1] : null;
  const cyclesDone: Record<number, boolean> = {};
  for (const c of cfg.cycles) cyclesDone[c.number] = obs.some((o) => o.cycle === c.number);
  const scoredExpected = new Set(obs.flatMap((o) => o.scores.filter((s) => s.score !== null && s.expected_status === "expected").map((s) => s.indicator)));
  return {
    resident: r,
    standing: standingAt(today, cfg, rules),
    expected,
    latest,
    areaAvg,
    lastObs,
    daysSince: lastObs ? daysBetween(lastObs.observed_date, today) : null,
    obsThisCycle: obs.filter((o) => o.cycle === currentCycle).length,
    currentCycle,
    cyclesDone,
    missing: [...expected].filter((c) => !scoredExpected.has(c)),
  };
}

/** Score map for one observation (expected scores only unless includeEarly). */
export function scoreMap(o: Observation, includeEarly = false): Record<string, number | null> {
  const m: Record<string, number | null> = {};
  for (const s of o.scores) if (includeEarly || s.expected_status === "expected") m[s.indicator] = s.score;
  return m;
}
