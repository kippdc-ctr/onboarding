import "server-only";
import { cache } from "react";
import { sql } from "./db";

export type Resident = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  picker_label: string | null;
  grade_band: string | null;
  group_number: number | null;
  school: string | null;
  email: string | null;
  cohort_year: number;
  active: boolean;
  is_sample: boolean;
  added_on: string;
  pin_encrypted: string | null;
  pin_set_at: Date | null;
  failed_pin_attempts: number;
  locked: boolean;
  praxis_exempt: boolean | null;
  last_active_at: Date | null;
};

export type PhaseItem = {
  id: string;
  phase: 1 | 3;
  sort_order: number;
  label: string;
  description: string | null;
  link_key: string | null;
  due_rule: "group_plus_days" | "fixed";
  due_days: number | null;
  due_date: string | null;
  required: boolean;
  condition: string | null;
};

export type ModuleMeta = {
  slug: string;
  title: string;
  sort_order: number;
  due_date: string | null;
  soft_due_date: Date | null;
  enabled: boolean;
};

export type Group = { number: number; welcome_email_date: string | null };

export type Config = {
  today: string;
  groups: Group[];
  modules: ModuleMeta[];
  phaseItems: PhaseItem[];
  overrides: { group_number: number; target: string; due_date: string }[];
  settings: Record<string, string>;
};

export type ProgressBundle = {
  itemChecks: { item_id: string; checked: boolean; checked_at: Date | null; verified: boolean; verified_at: Date | null }[];
  checklist: { module_slug: string; item_id: string; checked: boolean; checked_at: Date | null; verified: boolean }[];
  attempts: { module_slug: string; attempt_no: number; question_id: string; selected_option: string; is_correct: boolean; attempted_at: Date }[];
  reflections: { module_slug: string; prompt_id: string; response_text: string; updated_at: Date }[];
  activities: { module_slug: string; activity_id: string; payload_json: Record<string, unknown>; completed_at: Date | null }[];
  moduleProgress: { module_slug: string; started_at: Date | null; completed_at: Date | null; last_active_at: Date | null }[];
  praxis: { stage: number | null; math: string | null; reading: string | null; writing: string | null; updated_at: Date } | null;
  forms: { form_slug: string; status: "draft" | "submitted"; submitted_at: Date | null }[];
};

export const getSettings = cache(async (): Promise<Record<string, string>> => {
  const rows = await sql<{ key: string; value: string }[]>`select key, value from settings`;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

export const getConfig = cache(async (today: string): Promise<Config> => {
  const [groups, modules, phaseItems, overrides, settings] = await Promise.all([
    sql<Group[]>`select number, welcome_email_date from groups order by number`,
    sql<ModuleMeta[]>`select * from modules order by sort_order`,
    sql<PhaseItem[]>`select * from phase_items order by phase, sort_order`,
    sql<Config["overrides"]>`select group_number, target, due_date from group_due_overrides`,
    getSettings(),
  ]);
  return { today, groups, modules, phaseItems, overrides, settings };
});

export async function getResidentById(id: string): Promise<Resident | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql<Resident[]>`select * from residents where id = ${id}`;
  return r ?? null;
}

function emptyBundle(): ProgressBundle {
  return { itemChecks: [], checklist: [], attempts: [], reflections: [], activities: [], moduleProgress: [], praxis: null, forms: [] };
}

/** Load progress for many residents at once (admin grid, exports). */
export async function loadBundles(residentIds: string[]): Promise<Map<string, ProgressBundle>> {
  const map = new Map<string, ProgressBundle>();
  for (const id of residentIds) map.set(id, emptyBundle());
  if (residentIds.length === 0) return map;
  const ids = residentIds;
  const [ic, cl, qa, rf, ac, mp, px, fr] = await Promise.all([
    sql`select resident_id, item_id, checked, checked_at, verified, verified_at from item_checks where resident_id = any(${ids}::uuid[])`,
    sql`select resident_id, module_slug, item_id, checked, checked_at, verified from checklist_items where resident_id = any(${ids}::uuid[])`,
    sql`select resident_id, module_slug, attempt_no, question_id, selected_option, is_correct, attempted_at from quiz_attempts where resident_id = any(${ids}::uuid[]) order by attempted_at`,
    sql`select resident_id, module_slug, prompt_id, response_text, updated_at from reflections where resident_id = any(${ids}::uuid[])`,
    sql`select resident_id, module_slug, activity_id, payload_json, completed_at from activity_results where resident_id = any(${ids}::uuid[])`,
    sql`select resident_id, module_slug, started_at, completed_at, last_active_at from module_progress where resident_id = any(${ids}::uuid[])`,
    sql`select resident_id, stage, math, reading, writing, updated_at from praxis_status where resident_id = any(${ids}::uuid[])`,
    sql`select resident_id, form_slug, status, submitted_at from form_responses where resident_id = any(${ids}::uuid[])`,
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (rows: any[], key: Exclude<keyof ProgressBundle, "praxis">) => {
    for (const { resident_id, ...rest } of rows) map.get(resident_id)?.[key].push(rest as never);
  };
  push(ic, "itemChecks");
  push(cl, "checklist");
  push(qa, "attempts");
  push(rf, "reflections");
  push(ac, "activities");
  push(mp, "moduleProgress");
  push(fr, "forms");
  for (const { resident_id, ...rest } of px) {
    const b = map.get(resident_id);
    if (b) b.praxis = rest as ProgressBundle["praxis"];
  }
  return map;
}

export async function loadBundle(residentId: string): Promise<ProgressBundle> {
  return (await loadBundles([residentId])).get(residentId)!;
}

export function displayName(r: Pick<Resident, "first_name" | "last_name" | "preferred_name">): string {
  return `${r.preferred_name?.trim() || r.first_name} ${r.last_name}`;
}

export function pickerName(r: Pick<Resident, "first_name" | "last_name" | "preferred_name" | "picker_label">): string {
  return r.picker_label ? `${displayName(r)} (${r.picker_label})` : displayName(r);
}
