import "server-only";
import { sql } from "./db";
import { getCampuses, getGoals, getPeriods } from "./data";
import { commitResults } from "./imports";
import { suggestMapping } from "./mapping";

// Clearly fake residents and results so the screens can be tried before real data is imported.
// Goes through the same import code as real files; everything is flagged is_sample and removable in one click.

const FIRST = ["Avery", "Jordan", "Riley", "Morgan", "Taylor", "Casey", "Quinn", "Reese", "Skyler", "Emerson", "Rowan", "Hayden", "Jules", "Kendall", "Logan", "Parker", "Sage"];
const RACE = ["Black", "Black", "Black", "Black", "Hispanic or Latino", "White", "Asian", "Two or more races"];
const GRADES = ["ECE", "Elementary", "Elementary", "Middle", "Secondary"];

/** Deterministic pseudo-random numbers so sample data looks the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

export async function loadSampleData(year: string, runBy: string): Promise<string> {
  const [existing] = await sql<{ n: number }[]>`select count(*)::int as n from metrics.residents where school_year = ${year} and is_sample`;
  if (existing.n) return "Sample data is already loaded.";
  const campuses = await getCampuses();
  const rand = rng(7);
  const people: { first_name: string; last_name: string; campus: string; role: "first_year" | "senior"; status: string }[] = [];
  for (let i = 1; i <= 67; i++) {
    const senior = i > 50;
    const campus = campuses[i % campuses.length];
    people.push({ first_name: FIRST[i % FIRST.length], last_name: `Sample${String(i).padStart(2, "0")}`, campus, role: senior ? "senior" : "first_year", status: i % 23 === 0 ? "Withdrawn" : "Enrolled - Resident" });
  }
  for (const [i, p] of people.entries()) {
    await sql`insert into metrics.residents ${sql({
      ...p,
      school_year: year,
      school: `${p.campus} ${["ES", "MS", "HS"][i % 3]}`,
      grade_band: GRADES[i % GRADES.length],
      group_label: `Group ${(i % 6) + 1}`,
      cohort: p.role === "senior" ? "2027" : "2028",
      race_ethnicity: RACE[Math.floor(rand() * RACE.length)],
      gender: rand() < 0.3 ? "Male" : "Female",
      mentor_teacher: `Mentor ${String.fromCharCode(65 + (i % 26))}`,
      is_sample: true,
    })} on conflict do nothing`;
  }

  const goals = await getGoals(year);
  const periods = (await getPeriods(year)).map((p) => p.key);
  const firstYear = people.filter((p) => p.role === "first_year");
  // [goal number, period, chance of "met"]
  const plan: [number, string, number][] = [
    [3, "C1", 0.97],
    [9, "C1", 0.88],
    [10, "C1", 0.78],
    [20, "C1", 0.82],
  ];
  for (const [num, period, p] of plan) {
    const goal = goals.find((g) => g.number === num);
    if (!goal || !periods.includes(period)) continue;
    const r = rng(num * 31);
    const csv = ["First,Last,Campus,Result", ...firstYear.map((x) => `${x.first_name},${x.last_name},${x.campus},${r() < p ? "Yes" : "No"}`)].join("\n");
    await commitResults(
      year,
      csv,
      suggestMapping("results", ["First", "Last", "Campus", "Result"]),
      { goalId: goal.id, period, threshold: null, missingAsNotMet: false, dataThrough: "2026-10-02", fileName: "sample-data.csv", isSample: true },
      runBy,
    );
  }
  const g41 = goals.find((g) => g.number === 41);
  if (g41 && periods.includes("Sprint 1")) {
    const [imp] = await sql<{ id: number }[]>`
      insert into metrics.imports (school_year, kind, source, goal_id, period, data_through, run_by, rows_total, rows_saved, is_sample)
      values (${year}, 'manual', ${g41.source}, ${g41.id}, 'Sprint 1', '2026-09-25', ${runBy}, 1, 1, true) returning id`;
    await sql`insert into metrics.measurements (goal_id, period, numerator, denominator, data_through, source_import_id, note)
              values (${g41.id}, 'Sprint 1', 1, 1, '2026-09-25', ${imp.id}, 'Sample: senior resident touchpoint delivered')
              on conflict do nothing`;
  }
  return `Loaded ${people.length} sample residents and sample results for goals 3, 9, 10, 20 (C1) and 41 (Sprint 1).`;
}

export async function deleteSampleData(year: string): Promise<string> {
  const imps = await sql`delete from metrics.imports where school_year = ${year} and is_sample returning id`;
  const res = await sql`delete from metrics.residents where school_year = ${year} and is_sample returning id`;
  return `Deleted ${res.length} sample residents and ${imps.length} sample imports.`;
}
