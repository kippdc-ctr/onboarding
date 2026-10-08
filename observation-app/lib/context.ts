import "server-only";
import { sql } from "./db";
import { getConfig, listResidents, listSteps, loadObservations, rulesFor, type ActionStep, type Observation } from "./data";
import { todayISO } from "./dates";
import type { ResidentRules } from "./rules";

// Everything the scoring screen needs, embedded in the page so it keeps working offline.

export type HistObs = {
  id: string;
  date: string;
  observedAt: string;
  type: string;
  involvement: string;
  observer: string;
  cycle: number;
  scores: Record<string, { score: number | null; early: boolean; cfs: string[] }>;
  steps: { assignmentId: string; stepId: string | null; text: string; indicator: string | null }[];
  follow: Record<string, string>; // prior assignment id -> result
};

export type ResidentCtx = {
  id: string;
  name: string;
  first: string;
  email: string;
  campus: string;
  school: string;
  advisor: string;
  gradeBand: string;
  content: string;
  mentor: string;
  rules: ResidentRules;
  history: HistObs[]; // oldest first
  priorities: { cycle: number; indicator: string | null; note: string }[];
};

export type ClientStep = Pick<
  ActionStep,
  "id" | "domain" | "indicator" | "cfs_ids" | "link_type" | "text" | "skill_level" | "grade_band" | "content_area" | "look_fors" | "practice_rep" | "resource_url" | "tags" | "intro_cycle"
> & { retired?: boolean };

export function toClientStep(s: ActionStep): ClientStep {
  return {
    id: s.id,
    domain: s.domain,
    indicator: s.indicator,
    cfs_ids: s.cfs_ids,
    link_type: s.link_type,
    text: s.text,
    skill_level: s.skill_level,
    grade_band: s.grade_band,
    content_area: s.content_area,
    look_fors: s.look_fors,
    practice_rep: s.practice_rep,
    resource_url: s.resource_url,
    tags: s.tags,
    intro_cycle: s.intro_cycle,
    retired: s.status !== "active",
  };
}

export type ScoringData = {
  today: string;
  cfg: {
    cycles: Awaited<ReturnType<typeof getConfig>>["cycles"];
    indicators: Awaited<ReturnType<typeof getConfig>>["indicators"];
    tiers: Awaited<ReturnType<typeof getConfig>>["tiers"];
    tracks: Awaited<ReturnType<typeof getConfig>>["tracks"];
    cfs: Awaited<ReturnType<typeof getConfig>>["cfs"];
    observers: { id: string; name: string; full_name: string }[];
    types: string[];
    involvement: string[];
    maxSteps: number;
    rubricNote: string;
    nextNote: string;
    snapshotDefault: boolean;
  };
  residents: ResidentCtx[];
  steps: ClientStep[];
};

function toHist(o: Observation): HistObs {
  return {
    id: o.id,
    date: o.observed_date,
    observedAt: o.observed_at,
    type: o.type,
    involvement: o.involvement,
    observer: o.observer_id,
    cycle: o.cycle,
    scores: Object.fromEntries(o.scores.map((s) => [s.indicator, { score: s.score, early: s.expected_status === "early", cfs: s.cfs_demonstrated }])),
    steps: o.steps.map((s) => ({ assignmentId: s.id, stepId: s.step_id, text: s.wording_snapshot, indicator: s.indicator })),
    follow: Object.fromEntries(o.followthrough.map((f) => [f.prior_assignment_id, f.result])),
  };
}

export async function loadScoringData(): Promise<ScoringData> {
  const [cfg, residents, observations, steps] = await Promise.all([getConfig(), listResidents(), loadObservations(), listSteps()]);
  const rules = await rulesFor(residents.map((r) => r.id));
  const priorities = await sql<{ resident_id: string; cycle: number; indicator: string | null; note: string }[]>`
    select resident_id, cycle, indicator, note from resident_priorities where not closed order by created_at`;
  const byRes = new Map<string, HistObs[]>();
  for (const o of observations) {
    if (!byRes.has(o.resident_id)) byRes.set(o.resident_id, []);
    byRes.get(o.resident_id)!.push(toHist(o));
  }
  return {
    today: todayISO(),
    cfg: {
      cycles: cfg.cycles,
      indicators: cfg.indicators,
      tiers: cfg.tiers,
      tracks: cfg.tracks,
      cfs: cfg.cfs,
      observers: cfg.observers.map((o) => ({ id: o.id, name: o.name, full_name: o.full_name })),
      types: cfg.types,
      involvement: cfg.involvement,
      maxSteps: Math.max(1, Math.min(5, Number(cfg.settings.max_action_steps) || 2)),
      rubricNote: cfg.settings.rubric_note ?? "",
      nextNote: cfg.settings.email_next_steps ?? "",
      snapshotDefault: cfg.settings.email_snapshot_default !== "false",
    },
    residents: residents.map((r) => ({
      id: r.id,
      name: r.full_name,
      first: r.preferred_first || r.full_name.split(" ")[0],
      email: r.email,
      campus: r.campus,
      school: r.school,
      advisor: r.advisor_code,
      gradeBand: r.grade_band,
      content: r.content,
      mentor: r.mentor_teacher,
      rules: rules.get(r.id)!,
      history: byRes.get(r.id) ?? [],
      priorities: priorities.filter((p) => p.resident_id === r.id).map(({ cycle, indicator, note }) => ({ cycle, indicator, note })),
    })),
    steps: steps.map(toClientStep),
  };
}
