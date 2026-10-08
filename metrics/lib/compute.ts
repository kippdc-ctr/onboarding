// Turns per-resident results into measurement rows (overall + breakdowns), and applies
// the derived-goal rules (goals 32 and 33). Pure functions, tested in tests/compute.test.ts.

export type BreakdownType = "all" | "campus" | "school" | "grade_band" | "group" | "race_ethnicity" | "gender";

export const BREAKDOWN_LABEL: Record<BreakdownType, string> = {
  all: "All",
  campus: "Campus",
  school: "School",
  grade_band: "Grade band",
  group: "Group",
  race_ethnicity: "Race / ethnicity",
  gender: "Gender",
};

/** Breakdowns built from the roster. Demographic ones are only shown to the owner and CTR team, never to RDLs. */
export const ROSTER_BREAKDOWNS: Exclude<BreakdownType, "all">[] = ["campus", "school", "grade_band", "group"];
export const DEMOGRAPHIC_BREAKDOWNS: Exclude<BreakdownType, "all">[] = ["race_ethnicity", "gender"];

export type MemberResident = {
  campus: string | null;
  school: string | null;
  grade_band: string | null;
  group_label: string | null;
  race_ethnicity: string | null;
  gender: string | null;
};

export type Member = { counted: boolean; met: boolean; resident: MemberResident };

export type Computed = { breakdown_type: BreakdownType; breakdown_value: string; numerator: number; denominator: number };

function keyOf(r: MemberResident, b: Exclude<BreakdownType, "all">): string | null {
  const v = b === "group" ? r.group_label : r[b];
  return v && v.trim() ? v.trim() : null;
}

export function computeMeasurements(members: Member[]): Computed[] {
  const counted = members.filter((m) => m.counted);
  const out: Computed[] = [
    { breakdown_type: "all", breakdown_value: "", numerator: counted.filter((m) => m.met).length, denominator: counted.length },
  ];
  for (const b of [...ROSTER_BREAKDOWNS, ...DEMOGRAPHIC_BREAKDOWNS]) {
    const groups = new Map<string, { n: number; d: number }>();
    for (const m of counted) {
      const k = keyOf(m.resident, b);
      if (!k) continue;
      const g = groups.get(k) ?? { n: 0, d: 0 };
      g.d++;
      if (m.met) g.n++;
      groups.set(k, g);
    }
    for (const [k, g] of [...groups].sort((a, z) => a[0].localeCompare(z[0]))) {
      out.push({ breakdown_type: b, breakdown_value: k, numerator: g.n, denominator: g.d });
    }
  }
  return out;
}

export type DeriveRule =
  | { from: number; kind: "subset"; filter: Partial<Record<"race_ethnicity" | "gender" | "campus" | "grade_band", string>> }
  | { from: number; kind: "gap"; points: number; by: ("race_ethnicity" | "gender")[] };

/** Case-insensitive prefix match, so "black" matches "Black" and "Black or African American". */
function matches(value: string | null, wanted: string): boolean {
  return !!value && value.trim().toLowerCase().startsWith(wanted.trim().toLowerCase());
}

/** Members of the source goal that a "subset" rule keeps (e.g. Black male residents for goal 32). */
export function subsetMembers<T extends Member>(members: T[], filter: Extract<DeriveRule, { kind: "subset" }>["filter"]): T[] {
  return members.filter((m) => Object.entries(filter).every(([k, v]) => matches(m.resident[k as keyof MemberResident], v!)));
}

/**
 * "No demographic group falls more than N points below the overall rate" (goal 33).
 * Only groups of at least `minN` residents are evaluated. Numerator = groups below; denominator = groups evaluated.
 */
export function gapCount(members: Member[], rule: Extract<DeriveRule, { kind: "gap" }>, minN: number): { numerator: number; denominator: number; below: string[] } {
  const all = computeMeasurements(members);
  const overall = all.find((c) => c.breakdown_type === "all")!;
  const overallRate = overall.denominator ? (overall.numerator / overall.denominator) * 100 : 0;
  const evaluated = all.filter((c) => (rule.by as string[]).includes(c.breakdown_type) && c.denominator >= minN);
  const below = evaluated.filter((c) => overallRate - (c.numerator / c.denominator) * 100 > rule.points + 1e-9);
  return { numerator: below.length, denominator: evaluated.length, below: below.map((c) => `${c.breakdown_value}`) };
}

/** Small-n suppression: true when a people-count below the threshold must be hidden from this viewer. */
export function suppressed(denominator: number | null, opts: { suppressSmallN: boolean; isOwner: boolean; smallN: number }): boolean {
  if (opts.isOwner || !opts.suppressSmallN || denominator === null) return false;
  return denominator < opts.smallN;
}
