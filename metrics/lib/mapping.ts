// Column mapping for CSV imports. Shared by the server and the import wizard (no server-only imports).

export type ImportKind = "roster" | "results" | "aggregate";

export type FieldDef = { key: string; label: string; required?: boolean; aliases: string[]; help?: string };

export const FIELDS: Record<ImportKind, FieldDef[]> = {
  roster: [
    { key: "first_name", label: "Legal first name", required: true, aliases: ["first", "first name", "legal first name", "firstname"] },
    { key: "last_name", label: "Legal last name", required: true, aliases: ["last", "last name", "legal last name", "lastname", "surname"] },
    { key: "campus", label: "Campus", required: true, aliases: ["campus", "region", "campus name"] },
    { key: "preferred_name", label: "Preferred name", aliases: ["preferred", "preferred name", "nickname", "goes by"] },
    { key: "email", label: "Email", aliases: ["email", "email address", "kipp email", "work email"] },
    { key: "school", label: "School", aliases: ["school", "school name", "placement school"] },
    { key: "grade_band", label: "Grade band", aliases: ["grade band", "gradeband", "grade level", "band"] },
    { key: "group_label", label: "Group", aliases: ["group", "coaching group", "advisor group"] },
    { key: "cohort", label: "Cohort", aliases: ["cohort", "cohort year"] },
    { key: "role", label: "Role (first-year or senior)", aliases: ["role", "year", "resident type", "program year"], help: "\"Senior\" anywhere in the value means senior resident; anything else is first-year." },
    { key: "status", label: "Status", aliases: ["status", "enrollment status", "resident status"] },
    { key: "mentor_teacher", label: "Mentor teacher", aliases: ["mentor", "mentor teacher", "mt", "mentor name"] },
    { key: "race_ethnicity", label: "Race / ethnicity", aliases: ["race", "ethnicity", "race/ethnicity", "race ethnicity"] },
    { key: "gender", label: "Gender", aliases: ["gender", "sex", "gender identity"] },
  ],
  results: [
    { key: "first_name", label: "Legal first name", aliases: ["first", "first name", "legal first name", "firstname"] },
    { key: "last_name", label: "Legal last name", aliases: ["last", "last name", "legal last name", "lastname"] },
    { key: "full_name", label: "Full name (instead of first/last)", aliases: ["name", "resident", "resident name", "full name"] },
    { key: "campus", label: "Campus", aliases: ["campus", "region"] },
    { key: "result", label: "Result", required: true, aliases: ["result", "met", "met goal", "status", "score", "value", "pass"], help: "Met: Yes, Met, Pass, Exempt, On time, 1. Not met: No, Not met, Fail, Late, 0. Left out: blank, N/A, Exclude. Or a number, with a score threshold." },
  ],
  aggregate: [
    { key: "goal", label: "Goal number", required: true, aliases: ["goal", "goal number", "goal #", "#", "number"] },
    { key: "period", label: "Period", required: true, aliases: ["period", "cycle", "window", "measured at"] },
    { key: "numerator", label: "Numerator", required: true, aliases: ["numerator", "count", "met", "agree", "yes"] },
    { key: "denominator", label: "Denominator", aliases: ["denominator", "total", "n", "respondents", "of"] },
    { key: "breakdown_type", label: "Breakdown (campus, school, grade band…)", aliases: ["breakdown", "breakdown type", "by"] },
    { key: "breakdown_value", label: "Breakdown value", aliases: ["breakdown value", "group value", "value"] },
    { key: "note", label: "Note", aliases: ["note", "notes", "comment"] },
  ],
};

export type Mapping = Record<string, number | null>; // field key -> column index

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/#]+/g, " ").trim();

/** Prefer a saved mapping when its column names are still present; otherwise match aliases. */
export function suggestMapping(kind: ImportKind, headers: string[], saved?: Record<string, string> | null): Mapping {
  const h = headers.map(norm);
  const out: Mapping = {};
  const used = new Set<number>();
  for (const f of FIELDS[kind]) {
    let idx = -1;
    if (saved?.[f.key]) idx = h.indexOf(norm(saved[f.key]));
    if (idx < 0) idx = h.findIndex((x, i) => !used.has(i) && (x === norm(f.label) || f.aliases.includes(x)));
    out[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return out;
}

/** Saved by column name so a re-ordered sheet still maps. */
export function mappingByName(m: Mapping, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, i] of Object.entries(m)) if (i !== null && headers[i] !== undefined) out[k] = headers[i];
  return out;
}

export function unmappedColumns(m: Mapping, headers: string[]): string[] {
  const used = new Set(Object.values(m).filter((x): x is number => x !== null));
  return headers.filter((h, i) => !used.has(i) && h.trim() !== "");
}
