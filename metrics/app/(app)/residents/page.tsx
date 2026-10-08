import Link from "next/link";
import { sql } from "@/lib/db";
import { campusScope, can, requireUser } from "@/lib/auth";
import { getCampuses, getSettings, getYear, Resident, residentName } from "@/lib/data";

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  if (!can.viewRoster(u)) return <p className="card">Your account doesn&apos;t have a campus yet. Ask Ashley to set one.</p>;
  const sp = await searchParams;
  const year = await getYear();
  const scope = campusScope(u);
  const [all, campuses, settings] = await Promise.all([
    sql<Resident[]>`select * from metrics.residents where school_year = ${year.id} ${scope ? sql`and campus = ${scope}` : sql``} order by last_name, first_name`,
    getCampuses(),
    getSettings(),
  ]);
  const f = { campus: scope ?? one(sp, "campus"), grade: one(sp, "grade"), role: one(sp, "role"), status: one(sp, "status"), q: one(sp, "q").toLowerCase() };
  const rows = all.filter(
    (r) =>
      (!f.campus || r.campus === f.campus) &&
      (!f.grade || r.grade_band === f.grade) &&
      (!f.role || r.role === f.role) &&
      (!f.status || (f.status === "enrolled" ? r.status === settings.enrolledStatus : r.status !== settings.enrolledStatus)) &&
      (!f.q || `${r.first_name} ${r.last_name} ${r.preferred_name ?? ""} ${r.school ?? ""} ${r.mentor_teacher ?? ""}`.toLowerCase().includes(f.q)),
  );
  const grades = [...new Set(all.map((r) => r.grade_band).filter((x): x is string => !!x))].sort();
  const demo = can.viewDemographics(u);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{scope ? `${scope} residents` : "Residents"}</h1>
          <p className="text-muted">
            {year.id} roster · {rows.length} of {all.length} shown. Resident profiles and the indicator grid come in the next phase.
          </p>
        </div>
        {can.runImports(u) && (
          <Link href="/import" className="btn-small">
            Import roster
          </Link>
        )}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4 sm:p-4">
        <label>
          <span className="label text-sm">Search</span>
          <input name="q" defaultValue={one(sp, "q")} className="input min-h-10 py-1" placeholder="Name, school, mentor" />
        </label>
        {!scope && (
          <Pick name="campus" label="Campus" value={f.campus} options={campuses.map((c) => [c, c])} />
        )}
        <Pick name="grade" label="Grade band" value={f.grade} options={grades.map((g) => [g, g])} />
        <Pick name="role" label="Role" value={f.role} options={[["first_year", "First-year"], ["senior", "Senior resident"]]} />
        <Pick name="status" label="Status" value={f.status} options={[["enrolled", settings.enrolledStatus], ["other", "Withdrawn / other"]]} />
        <button className="btn-small">Filter</button>
      </form>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">Name</th>
              <th className="th">Campus</th>
              <th className="th">School</th>
              <th className="th">Grade band</th>
              <th className="th">Group</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              <th className="th">Mentor teacher</th>
              {demo && <th className="th">Race / ethnicity</th>}
              {demo && <th className="th">Gender</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-brand/10">
                <td className="td font-semibold">
                  {residentName(r)}
                  {r.is_sample && <span className="ml-1 text-xs font-bold text-coral-ink">sample</span>}
                </td>
                <td className="td">{r.campus}</td>
                <td className="td">{r.school}</td>
                <td className="td">{r.grade_band}</td>
                <td className="td">{r.group_label}</td>
                <td className="td">{r.role === "senior" ? "Senior" : "First-year"}</td>
                <td className={`td ${r.status === settings.enrolledStatus ? "" : "font-semibold text-coral-ink"}`}>{r.status}</td>
                <td className="td">{r.mentor_teacher}</td>
                {demo && <td className="td">{r.race_ethnicity}</td>}
                {demo && <td className="td">{r.gender}</td>}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="td text-muted" colSpan={10}>
                  No residents{all.length ? " match these filters" : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {demo && <p className="text-sm text-muted">Demographic columns are visible to the Owner only.</p>}
    </div>
  );
}

function Pick({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label>
      <span className="label text-sm">{label}</span>
      <select name={name} defaultValue={value} className="input min-h-10 w-auto py-1">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
