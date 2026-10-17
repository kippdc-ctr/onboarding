import "server-only";
import { cache } from "react";
import { sql } from "./db";
import {
  EMPTY_RULES,
  type Cycle,
  type CycleOverride,
  type Indicator,
  type IndicatorOverride,
  type ResidentRules,
  type RulesConfig,
  type Tier,
  type Track,
  type TrackEntry,
} from "./rules";

export type Observer = { id: string; name: string; full_name: string; advisor_code: string; email: string; is_admin: boolean };
export type Cfs = { id: string; indicator: string; short_label: string; full_text: string; sort: number };
export type Resident = {
  id: string;
  person_id: string;
  full_name: string;
  preferred_first: string;
  last_name: string;
  pronouns: string;
  status: string;
  advisor_code: string;
  school: string;
  campus: string;
  grade_band: string;
  content: string;
  grade: string;
  mentor_teacher: string;
  mentor_email: string;
  manager: string;
  email: string;
  active: boolean;
  is_sample: boolean;
};
export type ActionStep = {
  id: string;
  domain: string;
  indicator: string;
  cfs_ids: string[];
  link_type: "single" | "multiple" | "cross_cutting";
  text: string;
  skill_level: string;
  grade_band: string;
  content_area: string;
  look_fors: string;
  practice_rep: string;
  resource_url: string;
  tags: string[];
  status: "active" | "draft" | "retired";
  is_legacy: boolean;
  replacement_id: string | null;
  merged_into: string | null;
  intro_cycle: number | null;
  source: string;
  pair_group: string;
  review_note: string;
  created_at: string;
  retired_at: string | null;
};

export type Config = RulesConfig & {
  cfs: Cfs[];
  observers: Observer[];
  settings: Record<string, string>;
  scoredIndicators: Indicator[];
  types: string[];
  involvement: string[];
  campuses: string[];
};

const lines = (s: string | undefined) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

export const getSettings = cache(async (): Promise<Record<string, string>> => {
  const rows = await sql<{ key: string; value: string }[]>`select key, value from settings`;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

export const getConfig = cache(async (): Promise<Config> => {
  const [cycles, indicators, cfs, tiers, tracks, observers, settings] = await Promise.all([
    sql<Cycle[]>`select * from cycles order by start_date`,
    sql<Indicator[]>`select * from indicators order by sort`,
    sql<Cfs[]>`select * from cfs order by sort`,
    sql<Tier[]>`select * from tiers order by number`,
    sql<Track[]>`select * from tracks order by sort`,
    sql<Observer[]>`select * from observers order by name`,
    getSettings(),
  ]);
  return {
    cycles: [...cycles],
    indicators: [...indicators],
    cfs: [...cfs],
    tiers: [...tiers],
    tracks: [...tracks],
    observers: [...observers],
    settings,
    scoredIndicators: indicators.filter((i) => i.scored),
    types: lines(settings.observation_types),
    involvement: lines(settings.involvement_levels),
    campuses: lines(settings.campuses),
  };
});

export function setting(cfg: Config, key: string, fallback: number): number {
  const n = Number(cfg.settings[key]);
  return Number.isFinite(n) && cfg.settings[key] !== "" ? n : fallback;
}

export async function listResidents(opts: { includeInactive?: boolean } = {}): Promise<Resident[]> {
  return [...(await sql<Resident[]>`
    select * from residents ${opts.includeInactive ? sql`` : sql`where active`} order by lower(full_name)`)];
}

export async function getResident(id: string): Promise<Resident | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql<Resident[]>`select * from residents where id = ${id}`;
  return r ?? null;
}

export async function rulesFor(residentIds: string[]): Promise<Map<string, ResidentRules>> {
  const out = new Map<string, ResidentRules>();
  if (!residentIds.length) return out;
  const [tracks, overrides, cycleOverrides] = await Promise.all([
    sql<(TrackEntry & { resident_id: string })[]>`
      select id, resident_id, track, tier, effective_from, to_json(created_at)#>>'{}' as created_at, reason, decided_by, set_by, previous_track, previous_tier
      from resident_track where resident_id = any(${residentIds}) order by effective_from, created_at`,
    sql<(IndicatorOverride & { resident_id: string })[]>`
      select resident_id, indicator, mode, effective_from, reason from resident_indicator_override where resident_id = any(${residentIds})`,
    sql<(CycleOverride & { resident_id: string })[]>`
      select resident_id, cycle, start_date, end_date from resident_cycle_override where resident_id = any(${residentIds})`,
  ]);
  for (const id of residentIds) out.set(id, { tracks: [], overrides: [], cycleOverrides: [] });
  for (const t of tracks) out.get(t.resident_id)!.tracks.push(t);
  for (const o of overrides) out.get(o.resident_id)!.overrides.push(o);
  for (const c of cycleOverrides) out.get(c.resident_id)!.cycleOverrides.push(c);
  return out;
}

export async function rulesForOne(residentId: string): Promise<ResidentRules> {
  return (await rulesFor([residentId])).get(residentId) ?? EMPTY_RULES;
}

// ---------- Observations ----------

export type ScoreRow = { indicator: string; score: number | null; expected_status: "expected" | "early"; cfs_demonstrated: string[]; comment: string };
export type StepRow = {
  id: string;
  slot: number;
  step_id: string | null;
  custom_text: string | null;
  custom_look_fors: string;
  custom_practice: string;
  indicator: string | null;
  personalization_note: string;
  wording_snapshot: string;
  legacy_text: boolean;
  promoted_step_id: string | null;
};
export type FollowRow = { prior_assignment_id: string; result: "yes" | "partially" | "no" | "not_observed"; note: string };
export type Observation = {
  id: string;
  client_id: string | null;
  resident_id: string;
  observer_id: string;
  type: string;
  involvement: string;
  observed_at: string;
  observed_date: string;
  cycle: number;
  cycle_overridden: boolean;
  status: "draft" | "submitted";
  internal_comments: string;
  affirming: string;
  adjusting: string;
  send_flag: boolean;
  include_snapshot: boolean;
  next_note: string;
  sent_at: string | null;
  sent_by: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  scores: ScoreRow[];
  steps: StepRow[];
  followthrough: FollowRow[];
};

async function attach(rows: Omit<Observation, "scores" | "steps" | "followthrough">[]): Promise<Observation[]> {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [scores, steps, follow] = await Promise.all([
    sql<(ScoreRow & { observation_id: string })[]>`select * from observation_scores where observation_id = any(${ids})`,
    sql<(StepRow & { observation_id: string })[]>`select * from observation_action_steps where observation_id = any(${ids}) order by slot`,
    sql<(FollowRow & { observation_id: string })[]>`select * from step_followthrough where observation_id = any(${ids})`,
  ]);
  const by = new Map<string, Observation>();
  const out = rows.map((r) => {
    const o: Observation = { ...r, scores: [], steps: [], followthrough: [] };
    by.set(r.id, o);
    return o;
  });
  for (const s of scores) by.get(s.observation_id)?.scores.push(s);
  for (const s of steps) by.get(s.observation_id)?.steps.push(s);
  for (const f of follow) by.get(f.observation_id)?.followthrough.push(f);
  return out;
}

const OBS_COLS = sql`id, client_id, resident_id, observer_id, type, involvement, to_json(observed_at)#>>'{}' as observed_at, observed_date, cycle, cycle_overridden,
  status, internal_comments, affirming, adjusting, send_flag, include_snapshot, next_note, to_json(sent_at)#>>'{}' as sent_at, sent_by, source,
  to_json(created_at)#>>'{}' as created_at, to_json(updated_at)#>>'{}' as updated_at, to_json(submitted_at)#>>'{}' as submitted_at`;

/** Submitted observations, oldest first. */
export async function loadObservations(filter: { residentId?: string; ids?: string[] } = {}): Promise<Observation[]> {
  const rows = await sql<Omit<Observation, "scores" | "steps" | "followthrough">[]>`
    select ${OBS_COLS} from observations
    where deleted_at is null and status = 'submitted'
      ${filter.residentId ? sql`and resident_id = ${filter.residentId}` : sql``}
      ${filter.ids ? sql`and id = any(${filter.ids})` : sql``}
    order by observed_at, created_at`;
  return attach([...rows]);
}

export async function getObservation(id: string): Promise<Observation | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sql<Omit<Observation, "scores" | "steps" | "followthrough">[]>`
    select ${OBS_COLS} from observations where id = ${id} and deleted_at is null`;
  return (await attach([...rows]))[0] ?? null;
}

export async function listDrafts(observerId: string): Promise<(Observation & { resident_name: string })[]> {
  const rows = await sql<(Omit<Observation, "scores" | "steps" | "followthrough"> & { resident_name: string })[]>`
    select ${OBS_COLS}, (select full_name from residents r where r.id = resident_id) as resident_name
    from observations where status = 'draft' and deleted_at is null and observer_id = ${observerId} order by updated_at desc`;
  return (await attach([...rows])) as (Observation & { resident_name: string })[];
}

export async function listSteps(opts: { includeRetired?: boolean } = {}): Promise<ActionStep[]> {
  return [...(await sql<ActionStep[]>`
    select * from action_steps ${opts.includeRetired ? sql`` : sql`where status = 'active'`}
    order by (select sort from indicators where code = indicator), is_legacy, id`)];
}

export async function getStep(id: string): Promise<ActionStep | null> {
  const [s] = await sql<ActionStep[]>`select * from action_steps where id = ${id}`;
  return s ?? null;
}

/** Everything the dashboards need, in one load. The data set is small (tens of residents, hundreds of observations). */
export async function loadDataset() {
  const [cfg, residents, observations, steps] = await Promise.all([
    getConfig(),
    listResidents({ includeInactive: true }),
    loadObservations(),
    listSteps({ includeRetired: true }),
  ]);
  const rules = await rulesFor(residents.map((r) => r.id));
  const byResident = new Map<string, Observation[]>();
  for (const r of residents) byResident.set(r.id, []);
  for (const o of observations) byResident.get(o.resident_id)?.push(o);
  return { cfg, residents, observations, steps, rules, byResident };
}
export type Dataset = Awaited<ReturnType<typeof loadDataset>>;
