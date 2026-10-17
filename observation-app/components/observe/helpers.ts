import type { HistObs, ResidentCtx, ScoringData } from "@/lib/context";
import type { Draft } from "@/lib/draft";
import { cycleForDate, expectedIndicators, residentCycles, standingAt } from "@/lib/rules";

export type Cfg = ScoringData["cfg"];

export function rulesCfg(cfg: Cfg) {
  return { cycles: cfg.cycles, indicators: cfg.indicators, tiers: cfg.tiers, tracks: cfg.tracks };
}

/** History before this observation (excludes the one being edited). Oldest first. */
export function historyBefore(r: ResidentCtx, date: string, editingId?: string): HistObs[] {
  return r.history.filter((h) => h.id !== editingId && h.date <= date);
}

export function expectedFor(r: ResidentCtx, cfg: Cfg, date: string): Set<string> {
  return expectedIndicators(date, rulesCfg(cfg), r.rules);
}

export function standingFor(r: ResidentCtx, cfg: Cfg, date: string) {
  return standingAt(date, rulesCfg(cfg), r.rules);
}

export function autoCycle(r: ResidentCtx | undefined, cfg: Cfg, date: string): number {
  return cycleForDate(date, residentCycles(cfg.cycles, r?.rules.cycleOverrides ?? []));
}

export function latestScores(hist: HistObs[]): Record<string, { score: number | null; early: boolean; cfs: string[]; date: string }> {
  const m: Record<string, { score: number | null; early: boolean; cfs: string[]; date: string }> = {};
  for (const h of hist) for (const [code, s] of Object.entries(h.scores)) if (s.score !== null) m[code] = { ...s, date: h.date };
  return m;
}

/** For each library step: how often it was assigned to this resident, when last, and the follow-through result recorded for the last assignment. */
export function stepHistory(r: ResidentCtx) {
  const out: Record<string, { count: number; lastDate: string; lastResult: string | null }> = {};
  r.history.forEach((h, i) => {
    for (const s of h.steps) {
      if (!s.stepId) continue;
      const next = r.history.slice(i + 1).find((x) => x.follow[s.assignmentId]);
      const prev = out[s.stepId];
      out[s.stepId] = { count: (prev?.count ?? 0) + 1, lastDate: h.date, lastResult: next ? next.follow[s.assignmentId] : null };
    }
  });
  return out;
}

export function blankDraft(clientId: string, observerId: string, today: string, cfg: Cfg): Draft {
  return {
    clientId,
    residentId: "",
    observerId,
    type: "",
    involvement: "",
    date: today,
    cycleOverride: null,
    follow: {},
    scores: {},
    extra: [],
    steps: [],
    internal: "",
    affirming: "",
    adjusting: "",
    sendFlag: true,
    includeSnapshot: cfg.snapshotDefault,
    nextNote: cfg.nextNote,
  };
}

export function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(iso + "T12:00:00Z"));
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(iso + "T12:00:00Z"));
}
