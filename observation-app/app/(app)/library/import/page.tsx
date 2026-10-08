import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function LibraryImport() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <p><Link className="link text-sm" href="/library">← Library</Link></p>
      <h1 className="h1">Bulk import steps</h1>
      <div className="card text-sm">
        <p>Paste from a Sheet or upload a CSV. Columns (header row required): <code>id, indicator, text, cfs_ids, link_type, look_fors, practice_rep, resource_url, tags, skill_level, grade_band, content_area, status</code>.</p>
        <ul className="mt-2 list-disc pl-5">
          <li>A row with an existing <b>id</b> updates that step (blank cells leave fields as they are). This is the easy way to fill in look-fors and practice reps: download the library CSV, fill the columns, and import it back.</li>
          <li>A row without an id adds a new step with the next permanent ID.</li>
          <li><code>cfs_ids</code> like <code>CC.A.6.2; CC.A.6.3</code>. <code>link_type</code> is single, multiple, or cross_cutting.</li>
        </ul>
      </div>
      <ImportForm />
    </div>
  );
}
