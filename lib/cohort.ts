import "server-only";
import { sql } from "./db";
import { getConfig, loadBundles, Resident, ProgressBundle, Config } from "./data";
import { todayISO } from "./dates";
import { summarize, ResidentSummary } from "./progress";

export type Filters = {
  group?: string;
  grade?: string;
  school?: string;
  status?: string; // overdue | not_started | complete | incomplete
  added_after?: string;
  q?: string;
  sort?: string; // name | done
  inactive?: string;
};

export type Row = { r: Resident; b: ProgressBundle; s: ResidentSummary };

export async function loadCohort(f: Filters = {}): Promise<{ cfg: Config; rows: Row[]; schools: string[] }> {
  const cfg = await getConfig(todayISO());
  const residents = await sql<Resident[]>`
    select * from residents ${f.inactive ? sql`` : sql`where active`} order by last_name, first_name`;
  const schools = [...new Set(residents.map((r) => r.school).filter((s): s is string => !!s))].sort();
  let list = residents.filter(
    (r) =>
      (!f.group || String(r.group_number) === f.group) &&
      (!f.grade || r.grade_band === f.grade) &&
      (!f.school || r.school === f.school) &&
      (!f.added_after || r.added_on >= f.added_after) &&
      (!f.q || `${r.first_name} ${r.last_name} ${r.preferred_name ?? ""}`.toLowerCase().includes(f.q.toLowerCase())),
  );
  const bundles = await loadBundles(list.map((r) => r.id));
  let rows = list.map((r) => {
    const b = bundles.get(r.id)!;
    return { r, b, s: summarize(cfg, r, b) };
  });
  if (f.status === "overdue") rows = rows.filter((x) => x.s.anyOverdue);
  if (f.status === "not_started") rows = rows.filter((x) => x.s.nothingStarted);
  if (f.status === "complete") rows = rows.filter((x) => x.s.phases.every((p) => p.status === "complete"));
  if (f.status === "incomplete") rows = rows.filter((x) => !x.s.phases.every((p) => p.status === "complete"));
  if (f.sort === "done") rows.sort((a, b) => b.s.itemsComplete - a.s.itemsComplete);
  if (f.sort === "done_asc") rows.sort((a, b) => a.s.itemsComplete - b.s.itemsComplete);
  list = rows.map((x) => x.r);
  return { cfg, rows, schools };
}

export function filtersFrom(sp: Record<string, string | string[] | undefined>): Filters {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined) || undefined;
  return { group: g("group"), grade: g("grade"), school: g("school"), status: g("status"), added_after: g("added_after"), q: g("q"), sort: g("sort"), inactive: g("inactive") };
}

export function filterQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
