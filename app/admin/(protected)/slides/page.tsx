import Link from "next/link";
import { sql } from "@/lib/db";
import { displayName, Resident } from "@/lib/data";
import type { ActivityPayload } from "@/lib/activities";
import { IntroSlideCard } from "@/components/IntroSlideCard";
import { slideData } from "@/components/admin/ActivityView";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

/** Every resident's intro slide, for onboarding week. Print or save as PDF for one slide per page. */
export default async function Slides({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const rows = await sql<(Resident & { payload_json: ActivityPayload | null; completed_at: Date | null })[]>`
    select r.*, a.payload_json, a.completed_at
    from residents r
    left join activity_results a on a.resident_id = r.id and a.module_slug = 'your-story-matters' and a.activity_id = 'm2-intro-slide'
    where r.active order by r.last_name, r.first_name`;
  const list = rows.filter((r) => (!sp.group || String(r.group_number) === sp.group) && (!sp.grade || r.grade_band === sp.grade));
  const done = list.filter((r) => r.completed_at);
  const missing = list.filter((r) => !r.completed_at);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="h1">Intro slides</h1>
        <PrintButton />
      </div>
      <form method="get" className="card flex flex-wrap items-end gap-3 !p-4 print:hidden">
        <label className="text-sm">
          <span className="label">Group</span>
          <select name="group" defaultValue={sp.group ?? ""} className="input !min-h-10 w-24">
            <option value="">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Grade band</span>
          <select name="grade" defaultValue={sp.grade ?? ""} className="input !min-h-10 w-36">
            <option value="">All</option>
            {["ECE", "Elementary", "Middle", "Secondary"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <button className="btn-small">Apply</button>
        <p className="text-sm text-muted">
          {done.length} finished · {missing.length} not finished. Print (or save as PDF) for one slide per page.
        </p>
      </form>
      {missing.length > 0 && (
        <p className="text-sm print:hidden">
          <strong>Not finished yet:</strong>{" "}
          {missing.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/admin/residents/${r.id}`} className="link">
                {displayName(r)}
              </Link>
            </span>
          ))}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2 print:block">
        {done.map((r) => (
          <div key={r.id} className="break-after-page print:mb-0">
            <IntroSlideCard d={slideData(r.payload_json ?? undefined, r.cohort_year)} />
          </div>
        ))}
      </div>
    </div>
  );
}
