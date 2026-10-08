import "server-only";
import { sql } from "./db";
import { todayISO } from "./dates";
import { evaluate, Evaluation, PeriodLike, Thresholds } from "./status";
import type { BreakdownType, DeriveRule } from "./compute";

export type SchoolYear = { id: string; start_date: string; end_date: string; is_current: boolean; locked: boolean };
export type Period = PeriodLike & { school_year: string; confirmed: boolean };

export type GoalType = "achievement" | "perception" | "input";
export type Goal = {
  id: number;
  school_year: string;
  number: number;
  category: string;
  text: string;
  type: GoalType;
  population: string;
  unit: "percent" | "count";
  direction: "at_least" | "at_most";
  target_value: number;
  target_confirmed: boolean;
  target_count_note: string | null;
  numerator_def: string;
  denominator_def: string;
  source: string;
  measured_at: string | null;
  measured_label: string;
  pace_by: "cycle" | "sprint" | null;
  baseline_value: number | null;
  baseline_n: string | null;
  baseline_note: string | null;
  doc_change: string | null;
  suppress_small_n: boolean;
  counts_withdrawn: boolean;
  derive_rule: DeriveRule | null;
  visibility: "shared" | "private";
  owner: string;
  active: boolean;
};

export type Measurement = {
  id: number;
  goal_id: number;
  period: string;
  breakdown_type: BreakdownType;
  breakdown_value: string;
  numerator: number;
  denominator: number | null;
  data_through: string;
  source_import_id: number | null;
  note: string | null;
  created_at: Date;
};

export type Source = { key: string; label: string; feeds: string; stale_after_days: number | null; sort_order: number };

export type Resident = {
  id: string;
  school_year: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  campus: string | null;
  school: string | null;
  grade_band: string | null;
  group_label: string | null;
  cohort: string | null;
  role: "first_year" | "senior";
  status: string;
  mentor_teacher: string | null;
  race_ethnicity: string | null;
  gender: string | null;
  is_sample: boolean;
  updated_at: Date;
};

export const TYPE_LABEL: Record<GoalType, string> = {
  achievement: "Outcome: Achievement",
  perception: "Outcome: Perception",
  input: "Input",
};

export const POPULATION_LABEL: Record<string, string> = {
  first_year: "First-year residents",
  senior_residents: "Senior residents",
  mentor_teachers: "Mentor teachers",
  alumni: "CTR Alumni",
  incoming_cohort: "Incoming cohort",
  ctr_team: "CTR team",
  students: "Students of CTR Alumni",
};

export const CATEGORIES = [
  "Big Goal",
  "Clinical Practice + Coaching",
  "Mentor Teacher Effectiveness",
  "CTR Team Support",
  "Certification (PD, Coursework, Praxis)",
  "Recruitment + Onboarding",
  "Retention + Belonging",
  "Alumni Impact + Senior Residents",
];

export function residentName(r: Pick<Resident, "first_name" | "last_name" | "preferred_name">): string {
  return r.preferred_name && r.preferred_name !== r.first_name ? `${r.preferred_name} (${r.first_name}) ${r.last_name}` : `${r.first_name} ${r.last_name}`;
}

// ---------- Year, settings, calendar ----------

export async function listYears(): Promise<SchoolYear[]> {
  return sql<SchoolYear[]>`select * from metrics.school_years order by start_date desc`;
}

/** The year from ?year=, else the current year. */
export async function getYear(id?: string): Promise<SchoolYear> {
  const years = await listYears();
  const y = (id && years.find((x) => x.id === id)) || years.find((x) => x.is_current) || years[0];
  if (!y) throw new Error("No school year found. Run `npm run db:seed`.");
  return y;
}

export type Settings = { closePoints: number; noChangePoints: number; smallN: number; enrolledStatus: string };

export async function getSettings(): Promise<Settings> {
  const rows = await sql<{ key: string; value: string }[]>`select key, value from metrics.settings`;
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => (Number.isFinite(Number(m.get(k))) && m.get(k) !== "" ? Number(m.get(k)) : d);
  return {
    closePoints: num("close_points", 5),
    noChangePoints: num("no_change_points", 1),
    smallN: num("small_n", 5),
    enrolledStatus: m.get("enrolled_status") || "Enrolled - Resident",
  };
}

export function thresholds(s: Settings): Thresholds {
  return { closePoints: s.closePoints, noChangePoints: s.noChangePoints };
}

export async function getPeriods(year: string): Promise<Period[]> {
  return sql<Period[]>`select * from metrics.periods where school_year = ${year} order by sort_order, opens_on`;
}

export async function getCampuses(): Promise<string[]> {
  return (await sql<{ name: string }[]>`select name from metrics.campuses order by sort_order, name`).map((r) => r.name);
}

export async function getSources(): Promise<Source[]> {
  return sql<Source[]>`select * from metrics.sources order by sort_order`;
}

// ---------- Goals and measurements ----------

/** Shared goals only. Private (CORE) goals are never shown on the shared scorecard, exports, or detail pages. */
export async function getGoals(year: string, opts: { includeInactive?: boolean } = {}): Promise<Goal[]> {
  return sql<Goal[]>`
    select * from metrics.goals
    where school_year = ${year} and visibility = 'shared' ${opts.includeInactive ? sql`` : sql`and active`}
    order by number`;
}

export async function getGoal(id: number): Promise<Goal | null> {
  if (!Number.isInteger(id)) return null;
  const [g] = await sql<Goal[]>`select * from metrics.goals where id = ${id} and visibility = 'shared'`;
  return g ?? null;
}

export async function getMeasurements(goalIds: number[], breakdown: "all" | "any" = "all"): Promise<Measurement[]> {
  if (!goalIds.length) return [];
  return sql<Measurement[]>`
    select * from metrics.measurements
    where goal_id = any(${goalIds}) ${breakdown === "all" ? sql`and breakdown_type = 'all'` : sql``}
    order by goal_id, data_through`;
}

export type ScoredGoal = { goal: Goal; ev: Evaluation; measurements: Measurement[] };

export async function scoreGoals(year: SchoolYear, goals: Goal[], today = todayISO()): Promise<ScoredGoal[]> {
  const [periods, settings, ms] = await Promise.all([getPeriods(year.id), getSettings(), getMeasurements(goals.map((g) => g.id))]);
  const byGoal = new Map<number, Measurement[]>();
  for (const m of ms) byGoal.set(m.goal_id, [...(byGoal.get(m.goal_id) ?? []), m]);
  // A finished (locked) year is scored as of its last day.
  const asOf = year.locked && today > year.end_date ? year.end_date : today;
  return goals.map((goal) => {
    const list = byGoal.get(goal.id) ?? [];
    return { goal, measurements: list, ev: evaluate(goal, list, periods, asOf, thresholds(settings)) };
  });
}

export async function assertYearOpen(year: string) {
  const [y] = await sql<{ locked: boolean }[]>`select locked from metrics.school_years where id = ${year}`;
  if (!y) throw new Error("Unknown school year");
  if (y.locked) throw new Error(`${year} is locked. Unlock it in Admin → School years to make changes.`);
}
