import "server-only";
import { sql } from "./db";
import { parseCSV } from "./csv";
import { FIELDS, ImportKind, Mapping, mappingByName } from "./mapping";
import { computeMeasurements, gapCount, subsetMembers, type BreakdownType, type Member } from "./compute";
import { assertYearOpen, getCampuses, getGoals, getPeriods, getSettings, Goal, Resident, residentName } from "./data";

// Import rules (spec section 5): preview before saving; list unmatched names and unknown columns;
// never silently drop rows; match on legal name + campus; re-importing replaces that source's rows for that period.

export type Problem = { line: number; name: string; problem: string };

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function cellGetter(row: string[], m: Mapping) {
  return (key: string): string => {
    const i = m[key];
    return i === null || i === undefined ? "" : (row[i] ?? "").trim();
  };
}

export function parseWithHeader(csv: string): { headers: string[]; rows: string[][] } {
  const all = parseCSV(csv);
  return { headers: all[0] ?? [], rows: all.slice(1) };
}

function missingRequired(kind: ImportKind, m: Mapping): string | null {
  const missing = FIELDS[kind].filter((f) => f.required && (m[f.key] === null || m[f.key] === undefined)).map((f) => f.label);
  return missing.length ? `Choose a column for: ${missing.join(", ")}.` : null;
}

// ======================= Roster =======================

const ROSTER_KEYS = ["preferred_name", "email", "school", "grade_band", "group_label", "cohort", "role", "status", "mentor_teacher", "race_ethnicity", "gender"] as const;

export type RosterRow = {
  line: number;
  name: string;
  campus: string;
  action: "new" | "update" | "same";
  changes: string[];
  values: Record<string, string | null>;
  residentId?: string;
};

export type RosterPreview = { error?: string; rows: RosterRow[]; problems: Problem[]; notInFile: string[] };

function normalizeRole(v: string): "first_year" | "senior" | null {
  if (!v) return null;
  return /senior/i.test(v) ? "senior" : "first_year";
}

export async function previewRoster(year: string, csv: string, m: Mapping): Promise<RosterPreview> {
  const err = missingRequired("roster", m);
  if (err) return { error: err, rows: [], problems: [], notInFile: [] };
  const { rows } = parseWithHeader(csv);
  const campuses = await getCampuses();
  const campusByLc = new Map(campuses.map((c) => [lc(c), c]));
  const existing = await sql<Resident[]>`select * from metrics.residents where school_year = ${year}`;
  const byKey = new Map(existing.map((r) => [`${lc(r.first_name)}|${lc(r.last_name)}|${lc(r.campus)}`, r]));
  const seen = new Map<string, number>();
  const out: RosterRow[] = [];
  const problems: Problem[] = [];

  rows.forEach((row, i) => {
    const line = i + 2;
    const get = cellGetter(row, m);
    const first = get("first_name");
    const last = get("last_name");
    const name = `${first} ${last}`.trim();
    if (!first || !last) return problems.push({ line, name: name || "(no name)", problem: "Missing legal first or last name" });
    const campus = campusByLc.get(lc(get("campus")));
    if (!campus) return problems.push({ line, name, problem: get("campus") ? `Unknown campus "${get("campus")}" (expected one of ${campuses.join(", ")})` : "Missing campus" });
    const key = `${lc(first)}|${lc(last)}|${lc(campus)}`;
    if (seen.has(key)) return problems.push({ line, name, problem: `Duplicate of line ${seen.get(key)} (same legal name and campus)` });
    seen.set(key, line);

    const values: Record<string, string | null> = {};
    for (const k of ROSTER_KEYS) {
      if (m[k] === null || m[k] === undefined) continue; // unmapped columns leave existing values alone
      const v = get(k);
      values[k] = k === "role" ? normalizeRole(v) : v || null;
    }
    const prev = byKey.get(key);
    if (!prev) {
      out.push({ line, name, campus, action: "new", changes: [], values: { ...values, first_name: first, last_name: last } });
      return;
    }
    const changes = Object.entries(values)
      .filter(([k, v]) => k !== "role" || v !== null)
      .filter(([k, v]) => (prev[k as keyof Resident] ?? null) !== v)
      .map(([k]) => FIELDS.roster.find((f) => f.key === k)?.label ?? k);
    out.push({ line, name, campus, action: changes.length ? "update" : "same", changes, values, residentId: prev.id });
  });

  const inFile = new Set(seen.keys());
  const notInFile = existing.filter((r) => !inFile.has(`${lc(r.first_name)}|${lc(r.last_name)}|${lc(r.campus)}`)).map((r) => `${residentName(r)} (${r.campus ?? "no campus"})`);
  return { rows: out, problems, notInFile };
}

export async function commitRoster(year: string, csv: string, m: Mapping, fileName: string | null, runBy: string): Promise<{ saved: number; failed: number; importId: number }> {
  await assertYearOpen(year);
  const p = await previewRoster(year, csv, m);
  if (p.error) throw new Error(p.error);
  const { headers, rows } = parseWithHeader(csv);
  const importId = await sql.begin(async (tx) => {
    const [imp] = await tx<{ id: number }[]>`
      insert into metrics.imports (school_year, kind, source, file_name, data_through, run_by, rows_total, rows_saved, rows_failed, problems)
      values (${year}, 'roster', 'roster', ${fileName}, current_date, ${runBy}, ${rows.length}, ${p.rows.length}, ${p.problems.length}, ${tx.json(p.problems as never)})
      returning id`;
    for (const r of p.rows) {
      const v = Object.fromEntries(Object.entries(r.values).filter(([k, x]) => !(k === "role" && x === null)));
      if (r.action === "new") {
        await tx`insert into metrics.residents ${tx({ ...v, campus: r.campus, school_year: year })}`;
      } else if (r.action === "update" && Object.keys(v).length) {
        await tx`update metrics.residents set ${tx(v)}, updated_at = now() where id = ${r.residentId!}`;
      }
    }
    await saveMapping(tx, "roster", m, headers);
    return imp.id;
  });
  return { saved: p.rows.length, failed: p.problems.length, importId };
}

// ======================= Resident results for one goal =======================

export type ResultValue = "met" | "not_met" | "skip";

const MET = new Set(["yes", "y", "true", "1", "met", "pass", "passed", "exempt", "complete", "completed", "on time", "x", "✓", "done", "completer"]);
const NOT_MET = new Set(["no", "n", "false", "0", "not met", "fail", "failed", "incomplete", "late", "missing", "not complete", "not on time", "withdrawn"]);
const SKIP = new Set(["", "n/a", "na", "exclude", "excluded", "excused", "-", "—"]);

export function parseResult(raw: string, threshold: number | null): ResultValue | null {
  const s = raw.trim().toLowerCase();
  if (threshold !== null && s !== "" && Number.isFinite(Number(s))) return Number(s) >= threshold ? "met" : "not_met";
  if (SKIP.has(s)) return "skip";
  if (MET.has(s)) return "met";
  if (NOT_MET.has(s)) return "not_met";
  return null;
}

export type ResultRow = { line: number; name: string; residentId: string; residentName: string; campus: string | null; raw: string; counted: boolean; met: boolean; reason: string | null };
export type ResultsPreview = {
  error?: string;
  rows: ResultRow[];
  problems: Problem[];
  missing: { id: string; name: string; campus: string | null }[];
  numerator: number;
  denominator: number;
};

export type ResultsOptions = { goalId: number; period: string; threshold: number | null; missingAsNotMet: boolean };

function populationRole(goal: Goal): "first_year" | "senior" | null {
  if (goal.population === "first_year") return "first_year";
  if (goal.population === "senior_residents") return "senior";
  return null;
}

async function loadGoalForResults(year: string, goalId: number): Promise<{ goal?: Goal; error?: string }> {
  const goal = (await getGoals(year)).find((g) => g.id === goalId);
  if (!goal) return { error: "Choose a goal." };
  if (goal.type === "perception") return { error: "Survey goals stay aggregate: use the aggregate numbers import instead." };
  if (goal.derive_rule) return { error: `Goal ${goal.number} is calculated automatically from goal ${goal.derive_rule.from}. Import goal ${goal.derive_rule.from} instead.` };
  if (!populationRole(goal)) return { error: `Goal ${goal.number} is not about residents on the roster: use the aggregate numbers import or manual entry.` };
  return { goal };
}

export async function previewResults(year: string, csv: string, m: Mapping, o: ResultsOptions): Promise<ResultsPreview> {
  const empty = { rows: [], problems: [], missing: [], numerator: 0, denominator: 0 };
  const err = missingRequired("results", m);
  if (err) return { ...empty, error: err };
  const hasSplit = m.first_name !== null && m.first_name !== undefined && m.last_name !== null && m.last_name !== undefined;
  if (!hasSplit && (m.full_name === null || m.full_name === undefined)) return { ...empty, error: "Choose first and last name columns, or a full name column." };
  const { goal, error } = await loadGoalForResults(year, o.goalId);
  if (!goal) return { ...empty, error };
  const periods = await getPeriods(year);
  if (!periods.some((p) => p.key === o.period)) return { ...empty, error: "Choose a period." };

  const settings = await getSettings();
  const role = populationRole(goal)!;
  const residents = await sql<Resident[]>`select * from metrics.residents where school_year = ${year}`;
  const useCampus = m.campus !== null && m.campus !== undefined;
  const index = new Map<string, Resident[]>();
  for (const r of residents) {
    for (const k of [`${lc(r.first_name)} ${lc(r.last_name)}`, r.preferred_name ? `${lc(r.preferred_name)} ${lc(r.last_name)}` : null]) {
      if (!k) continue;
      const key = useCampus ? `${k}|${lc(r.campus)}` : k;
      const list = index.get(key) ?? [];
      if (!list.includes(r)) list.push(r);
      index.set(key, list);
    }
  }

  const { rows } = parseWithHeader(csv);
  const out: ResultRow[] = [];
  const problems: Problem[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const line = i + 2;
    const get = cellGetter(row, m);
    const name = hasSplit ? `${get("first_name")} ${get("last_name")}`.trim() : get("full_name");
    if (!name) return problems.push({ line, name: "(no name)", problem: "Missing name" });
    const campus = useCampus ? get("campus") : "";
    const matches = index.get(useCampus ? `${lc(name)}|${lc(campus)}` : lc(name)) ?? [];
    if (!matches.length) return problems.push({ line, name, problem: `No resident on the ${year} roster with this name${useCampus ? ` at "${campus}"` : ""}` });
    if (matches.length > 1) return problems.push({ line, name, problem: "More than one resident has this name: add a Campus column" });
    const r = matches[0];
    if (seen.has(r.id)) return problems.push({ line, name, problem: `Duplicate of line ${seen.get(r.id)}` });
    seen.set(r.id, line);
    if (r.role !== role) return problems.push({ line, name, problem: `Is a ${r.role === "senior" ? "senior" : "first-year"} resident; goal ${goal.number} counts ${role === "senior" ? "senior" : "first-year"} residents` });
    const raw = get("result");
    const v = parseResult(raw, o.threshold);
    if (v === null) return problems.push({ line, name, problem: `Can't read result "${raw}"${o.threshold === null ? " (set a score threshold for numbers)" : ""}` });
    const enrolled = lc(r.status) === lc(settings.enrolledStatus);
    let counted = v !== "skip";
    let reason: string | null = v === "skip" ? "Marked N/A in the file" : null;
    if (counted && !enrolled && !goal.counts_withdrawn) {
      counted = false;
      reason = `Status: ${r.status}`;
    }
    out.push({ line, name, residentId: r.id, residentName: residentName(r), campus: r.campus, raw, counted, met: counted && v === "met", reason });
  });

  const missing = residents
    .filter((r) => r.role === role && !seen.has(r.id) && (goal.counts_withdrawn || lc(r.status) === lc(settings.enrolledStatus)))
    .map((r) => ({ id: r.id, name: residentName(r), campus: r.campus }));
  const counted = out.filter((r) => r.counted);
  const numerator = counted.filter((r) => r.met).length;
  const denominator = counted.length + (o.missingAsNotMet ? missing.length : 0);
  return { rows: out, problems, missing, numerator, denominator };
}

type Tx = Parameters<Parameters<typeof sql.begin>[1]>[0];

async function saveMapping(tx: Tx, kind: ImportKind, m: Mapping, headers: string[]) {
  const byName = mappingByName(m, headers);
  await tx`insert into metrics.import_mappings (kind, mapping) values (${kind}, ${tx.json(byName)})
           on conflict (kind) do update set mapping = excluded.mapping`;
}

type MemberRow = { resident_id: string; counted: boolean; met: boolean; raw_value: string | null; reason: string | null };

/** Replaces a goal's resident results and measurements for one period, then recomputes goals derived from it. */
async function writeMembers(tx: Tx, year: string, goal: Goal, period: string, members: MemberRow[], dataThrough: string, importId: number, smallN: number) {
  await tx`delete from metrics.goal_members where goal_id = ${goal.id} and period = ${period}`;
  await tx`delete from metrics.measurements where goal_id = ${goal.id} and period = ${period}`;
  if (members.length) {
    await tx`insert into metrics.goal_members ${tx(members.map((x) => ({ ...x, goal_id: goal.id, period, source_import_id: importId })))}`;
  }
  const residents = await tx<Resident[]>`
    select r.* from metrics.residents r join metrics.goal_members gm on gm.resident_id = r.id
    where gm.goal_id = ${goal.id} and gm.period = ${period}`;
  const byId = new Map(residents.map((r) => [r.id, r]));
  const full: (Member & { row: MemberRow })[] = members.map((x) => ({ counted: x.counted, met: x.met, resident: byId.get(x.resident_id)!, row: x }));
  await insertComputed(tx, goal.id, period, computeMeasurements(full), dataThrough, importId);

  // Derived goals (e.g. 32 and 33 from 31) are recalculated from the same rows.
  const derived = (await getGoals(year)).filter((g) => g.derive_rule?.from === goal.number);
  for (const d of derived) {
    const rule = d.derive_rule!;
    await tx`delete from metrics.goal_members where goal_id = ${d.id} and period = ${period}`;
    await tx`delete from metrics.measurements where goal_id = ${d.id} and period = ${period}`;
    if (rule.kind === "subset") {
      const sub = subsetMembers(full, rule.filter);
      if (sub.length) await tx`insert into metrics.goal_members ${tx(sub.map((x) => ({ ...x.row, goal_id: d.id, period, source_import_id: importId })))}`;
      await insertComputed(tx, d.id, period, computeMeasurements(sub), dataThrough, importId);
    } else {
      const g = gapCount(full, rule, smallN);
      await tx`insert into metrics.measurements (goal_id, period, numerator, denominator, data_through, source_import_id)
               values (${d.id}, ${period}, ${g.numerator}, ${g.denominator}, ${dataThrough}, ${importId})`;
    }
  }
}

async function insertComputed(tx: Tx, goalId: number, period: string, rows: { breakdown_type: BreakdownType; breakdown_value: string; numerator: number; denominator: number }[], dataThrough: string, importId: number) {
  if (!rows.length) return;
  await tx`insert into metrics.measurements ${tx(rows.map((r) => ({ ...r, goal_id: goalId, period, data_through: dataThrough, source_import_id: importId })))}`;
}

export async function commitResults(
  year: string,
  csv: string,
  m: Mapping,
  o: ResultsOptions & { dataThrough: string; fileName: string | null; isSample?: boolean },
  runBy: string,
): Promise<{ saved: number; failed: number; numerator: number; denominator: number }> {
  await assertYearOpen(year);
  const p = await previewResults(year, csv, m, o);
  if (p.error) throw new Error(p.error);
  const goal = (await getGoals(year)).find((g) => g.id === o.goalId)!;
  const settings = await getSettings();
  const { headers, rows } = parseWithHeader(csv);
  const members: MemberRow[] = p.rows.map((r) => ({ resident_id: r.residentId, counted: r.counted, met: r.met, raw_value: r.raw, reason: r.reason }));
  for (const x of p.missing) {
    members.push({ resident_id: x.id, counted: o.missingAsNotMet, met: false, raw_value: null, reason: o.missingAsNotMet ? "Not in the file (counted as not met)" : "Not in the file" });
  }
  await sql.begin(async (tx) => {
    const [imp] = await tx<{ id: number }[]>`
      insert into metrics.imports (school_year, kind, source, goal_id, period, file_name, data_through, run_by, rows_total, rows_saved, rows_failed, problems, is_sample)
      values (${year}, 'results', ${goal.source}, ${goal.id}, ${o.period}, ${o.fileName}, ${o.dataThrough}, ${runBy}, ${rows.length}, ${p.rows.length},
              ${p.problems.length}, ${tx.json(p.problems as never)}, ${!!o.isSample})
      returning id`;
    await writeMembers(tx, year, goal, o.period, members, o.dataThrough, imp.id, settings.smallN);
    if (!o.isSample) await saveMapping(tx, "results", m, headers);
  });
  return { saved: p.rows.length, failed: p.problems.length, numerator: p.numerator, denominator: p.denominator };
}

// ======================= Aggregate numbers =======================

const BREAKDOWN_ALIASES: Record<string, BreakdownType> = {
  "": "all", all: "all", overall: "all", campus: "campus", school: "school", "grade band": "grade_band", gradeband: "grade_band", grade_band: "grade_band",
  group: "group", race: "race_ethnicity", ethnicity: "race_ethnicity", "race/ethnicity": "race_ethnicity", race_ethnicity: "race_ethnicity", gender: "gender",
};

export type AggregateRow = {
  line: number;
  goalId: number;
  goalNumber: number;
  period: string;
  breakdown_type: BreakdownType;
  breakdown_value: string;
  numerator: number;
  denominator: number | null;
  note: string | null;
  warning: string | null;
};
export type AggregatePreview = { error?: string; rows: AggregateRow[]; problems: Problem[]; replaces: string[] };

export async function previewAggregate(year: string, csv: string, m: Mapping, source: string): Promise<AggregatePreview> {
  const err = missingRequired("aggregate", m);
  if (err) return { error: err, rows: [], problems: [], replaces: [] };
  const goals = await getGoals(year);
  const byNumber = new Map(goals.map((g) => [g.number, g]));
  const periods = await getPeriods(year);
  const periodByLc = new Map(periods.map((p) => [lc(p.key), p.key]));
  const { rows } = parseWithHeader(csv);
  const out: AggregateRow[] = [];
  const problems: Problem[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const line = i + 2;
    const get = cellGetter(row, m);
    const label = `Goal ${get("goal") || "?"}, ${get("period") || "?"}`;
    const goal = byNumber.get(Number(get("goal").replace(/^#/, "")));
    if (!goal) return problems.push({ line, name: label, problem: `No goal number "${get("goal")}" in ${year}` });
    if (goal.derive_rule) return problems.push({ line, name: label, problem: `Goal ${goal.number} is calculated automatically from goal ${goal.derive_rule.from}` });
    const period = periodByLc.get(lc(get("period")));
    if (!period) return problems.push({ line, name: label, problem: `Unknown period "${get("period")}" (see Admin → Calendar)` });
    const num = Number(get("numerator"));
    const denRaw = get("denominator");
    const den = denRaw === "" ? null : Number(denRaw);
    if (get("numerator") === "" || !Number.isFinite(num) || num < 0) return problems.push({ line, name: label, problem: `Numerator "${get("numerator")}" is not a number` });
    if (goal.unit === "percent" && (den === null || !Number.isFinite(den) || den <= 0)) return problems.push({ line, name: label, problem: "A percent goal needs a denominator above 0" });
    if (den !== null && (!Number.isFinite(den) || num > den)) return problems.push({ line, name: label, problem: "Numerator is larger than the denominator" });
    const bt = BREAKDOWN_ALIASES[lc(get("breakdown_type"))];
    if (!bt) return problems.push({ line, name: label, problem: `Unknown breakdown "${get("breakdown_type")}" (use campus, school, grade band, group, race, gender, or leave blank)` });
    const bv = bt === "all" ? "" : get("breakdown_value");
    if (bt !== "all" && !bv) return problems.push({ line, name: label, problem: "Breakdown value is missing" });
    const key = `${goal.id}|${period}|${bt}|${lc(bv)}`;
    if (seen.has(key)) return problems.push({ line, name: label, problem: `Duplicate of line ${seen.get(key)}` });
    seen.set(key, line);
    out.push({
      line, goalId: goal.id, goalNumber: goal.number, period, breakdown_type: bt, breakdown_value: bv, numerator: num, denominator: den, note: get("note") || null,
      warning: goal.source !== source ? `Goal ${goal.number}'s source is "${goal.source}"` : null,
    });
  });

  // Which existing (goal, period) results this file replaces.
  const pairs = [...new Set(out.map((r) => `${r.goalId}|${r.period}`))];
  const replaces: string[] = [];
  for (const pr of pairs) {
    const [gid, period] = pr.split("|");
    const [c] = await sql<{ n: number; members: number }[]>`
      select (select count(*)::int from metrics.measurements where goal_id = ${Number(gid)} and period = ${period}) as n,
             (select count(*)::int from metrics.goal_members where goal_id = ${Number(gid)} and period = ${period}) as members`;
    if (c.n) replaces.push(`Goal ${goals.find((g) => g.id === Number(gid))!.number}, ${period}${c.members ? " (including resident-level results)" : ""}`);
  }
  return { rows: out, problems, replaces };
}

export async function commitAggregate(
  year: string,
  csv: string,
  m: Mapping,
  o: { source: string; dataThrough: string; fileName: string | null },
  runBy: string,
): Promise<{ saved: number; failed: number }> {
  await assertYearOpen(year);
  const p = await previewAggregate(year, csv, m, o.source);
  if (p.error) throw new Error(p.error);
  const { headers, rows } = parseWithHeader(csv);
  await sql.begin(async (tx) => {
    const [imp] = await tx<{ id: number }[]>`
      insert into metrics.imports (school_year, kind, source, file_name, data_through, run_by, rows_total, rows_saved, rows_failed, problems)
      values (${year}, 'aggregate', ${o.source}, ${o.fileName}, ${o.dataThrough}, ${runBy}, ${rows.length}, ${p.rows.length}, ${p.problems.length}, ${tx.json(p.problems as never)})
      returning id`;
    for (const pr of new Set(p.rows.map((r) => `${r.goalId}|${r.period}`))) {
      const [gid, period] = pr.split("|");
      await tx`delete from metrics.goal_members where goal_id = ${Number(gid)} and period = ${period}`;
      await tx`delete from metrics.measurements where goal_id = ${Number(gid)} and period = ${period}`;
    }
    if (p.rows.length) {
      await tx`insert into metrics.measurements ${tx(
        p.rows.map((r) => ({
          goal_id: r.goalId, period: r.period, breakdown_type: r.breakdown_type, breakdown_value: r.breakdown_value,
          numerator: r.numerator, denominator: r.denominator, note: r.note, data_through: o.dataThrough, source_import_id: imp.id,
        })),
      )}`;
    }
    await saveMapping(tx, "aggregate", m, headers);
  });
  return { saved: p.rows.length, failed: p.problems.length };
}

// ======================= Manual entry =======================

export async function saveManual(
  year: string,
  goal: Goal,
  v: { period: string; numerator: number; denominator: number | null; dataThrough: string; note: string | null },
  runBy: string,
) {
  await assertYearOpen(year);
  await sql.begin(async (tx) => {
    const [imp] = await tx<{ id: number }[]>`
      insert into metrics.imports (school_year, kind, source, goal_id, period, data_through, run_by, rows_total, rows_saved)
      values (${year}, 'manual', ${goal.source}, ${goal.id}, ${v.period}, ${v.dataThrough}, ${runBy}, 1, 1)
      returning id`;
    await tx`delete from metrics.goal_members where goal_id = ${goal.id} and period = ${v.period}`;
    await tx`delete from metrics.measurements where goal_id = ${goal.id} and period = ${v.period}`;
    await tx`insert into metrics.measurements (goal_id, period, numerator, denominator, data_through, source_import_id, note)
             values (${goal.id}, ${v.period}, ${v.numerator}, ${v.denominator}, ${v.dataThrough}, ${imp.id}, ${v.note})`;
  });
}

export async function getSavedMapping(kind: ImportKind): Promise<Record<string, string> | null> {
  const [r] = await sql<{ mapping: Record<string, string> }[]>`select mapping from metrics.import_mappings where kind = ${kind}`;
  return r?.mapping ?? null;
}
