import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/lib/content";
import { sql } from "@/lib/db";
import { displayName, Resident } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { answerText, FormAnswers } from "@/lib/forms";

export const dynamic = "force-dynamic";

export default async function FormResponses({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const form = getForm(slug);
  if (!form) notFound();
  const all = await sql<(Resident & { answers_json: FormAnswers | null; status: string | null; submitted_at: Date | null })[]>`
    select r.*, fr.answers_json, fr.status, fr.submitted_at
    from residents r left join form_responses fr on fr.resident_id = r.id and fr.form_slug = ${form.slug}
    where r.active order by r.last_name, r.first_name`;
  const schools = [...new Set(all.map((r) => r.school).filter(Boolean))].sort() as string[];
  const rows = all.filter(
    (r) => (!sp.group || String(r.group_number) === sp.group) && (!sp.grade || r.grade_band === sp.grade) && (!sp.school || r.school === sp.school) && (!sp.status || (r.status ?? "none") === sp.status),
  );
  const preview = form.questions.filter((q) => q.type === "single_choice" || q.type === "multi_select").slice(0, 3);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{form.title} responses</h1>
        <a className="btn-small" href={`/admin/export/form-${form.slug}${qs ? `?${qs}` : ""}`}>
          Export CSV
        </a>
      </div>
      <p className="rounded-xl border-2 border-coral bg-coral-wash p-3 font-semibold">Admin only. Responses include identity preferences; don&apos;t share this page or the export outside the CTR team.</p>
      <form method="get" className="card flex flex-wrap items-end gap-3 !p-4">
        <label className="text-sm">
          <span className="label">Group</span>
          <select name="group" defaultValue={sp.group ?? ""} className="input !min-h-10 w-24">
            <option value="">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Grade band</span>
          <select name="grade" defaultValue={sp.grade ?? ""} className="input !min-h-10 w-36">
            <option value="">All</option>
            {["ECE", "Elementary", "Middle", "Secondary"].map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">School</span>
          <select name="school" defaultValue={sp.school ?? ""} className="input !min-h-10 w-44">
            <option value="">All</option>
            {schools.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className="input !min-h-10 w-36">
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="draft">Draft</option>
            <option value="none">Not started</option>
          </select>
        </label>
        <button className="btn-small">Apply</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[50rem] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="p-2">Resident</th>
              <th className="p-2">Group</th>
              <th className="p-2">School</th>
              <th className="p-2">Status</th>
              {preview.map((q) => <th key={q.id} className="p-2">{q.prompt.slice(0, 40)}…</th>)}
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-brand/10 align-top">
                <td className="p-2 font-semibold">{displayName(r)}</td>
                <td className="p-2">{r.group_number ?? "—"}</td>
                <td className="p-2">{r.school ?? "—"}</td>
                <td className="p-2">{r.status === "submitted" ? `Submitted ${formatDateTime(r.submitted_at)}` : r.status === "draft" ? "Draft" : <span className="text-muted">Not started</span>}</td>
                {preview.map((q) => <td key={q.id} className="p-2">{r.answers_json ? answerText(q, r.answers_json) : ""}</td>)}
                <td className="p-2">{r.status && <Link className="link" href={`/admin/forms/${form.slug}/${r.id}`}>View</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
