import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/lib/content";
import { sql } from "@/lib/db";
import { displayName, getResidentById, getSettings } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { answerText, FormAnswers, questionOptions } from "@/lib/forms";
import { adminSaveForm, reopenForm } from "@/app/actions/admin";
import { AdminFormEditor } from "./AdminFormEditor";

export const dynamic = "force-dynamic";

export default async function AdminFormResponse({ params }: { params: Promise<{ slug: string; residentId: string }> }) {
  const { slug, residentId } = await params;
  const form = getForm(slug);
  const r = await getResidentById(residentId);
  if (!form || !r) notFound();
  const [resp] = await sql<{ answers_json: FormAnswers; status: string; submitted_at: Date | null; reopened_by: string | null }[]>`
    select answers_json, status, submitted_at, reopened_by from form_responses where resident_id = ${r.id} and form_slug = ${form.slug}`;
  if (!resp) notFound();
  const settings = await getSettings();
  const questions = form.questions.map((q) => ({ ...q, resolvedOptions: questionOptions(q, settings) }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p>
        <Link className="link" href={`/admin/forms/${form.slug}`}>← All responses</Link>
      </p>
      <h1 className="h1">
        {form.title}: {displayName(r)}
      </h1>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p>
          <strong>Status:</strong> {resp.status === "submitted" ? `Submitted ${formatDateTime(resp.submitted_at)}` : "Draft (resident can edit)"}
          {resp.reopened_by && <span className="text-muted"> · reopened by admin</span>}
        </p>
        {resp.status === "submitted" && (
          <form action={reopenForm.bind(null, r.id, form.slug)}>
            <button className="btn-small">Reopen for the resident</button>
          </form>
        )}
      </div>
      <section className="card">
        <h2 className="h2">Answers</h2>
        <dl className="mt-3 space-y-3">
          {form.questions.filter((q) => q.type !== "section").map((q) => (
            <div key={q.id}>
              <dt className="font-semibold">{q.prompt}</dt>
              <dd className="whitespace-pre-wrap">{answerText(q, resp.answers_json) || <span className="text-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
      </section>
      <details className="card">
        <summary className="h3 cursor-pointer">Edit answers</summary>
        <div className="mt-4">
          <AdminFormEditor questions={questions} initial={resp.answers_json} submit={adminSaveForm.bind(null, r.id, form.slug)} />
        </div>
      </details>
    </div>
  );
}
