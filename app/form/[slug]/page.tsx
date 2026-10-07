import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/lib/content";
import { sql } from "@/lib/db";
import { displayName, getSettings } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { questionOptions, FormAnswers } from "@/lib/forms";
import { requireResident } from "@/lib/session";
import { saveFormDraft, submitForm } from "@/app/actions/resident";
import { ResidentHeader } from "@/components/ResidentHeader";
import { ResidentForm } from "./ResidentForm";

export const dynamic = "force-dynamic";

export default async function FormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = getForm(slug);
  if (!form) notFound();
  const r = await requireResident();
  const settings = await getSettings();
  const [resp] = await sql<{ answers_json: FormAnswers; status: string; submitted_at: Date | null }[]>`
    select answers_json, status, submitted_at from form_responses where resident_id = ${r.id} and form_slug = ${form.slug}`;
  const back = form.linkedChecklist ? `/module/${form.linkedChecklist.moduleSlug}#preferences` : "/home";

  if (resp?.status === "submitted") {
    return (
      <>
        <ResidentHeader name={displayName(r)} />
        <main id="main" className="mx-auto max-w-2xl px-4 py-10">
          <div className="card text-center">
            <h1 className="h1">Submitted</h1>
            <p className="mt-3 text-lg">
              Your {form.title} was submitted {formatDateTime(resp.submitted_at)}. Thank you!
            </p>
            <p className="mt-2 text-muted">Responses are locked after you submit. If you need to change something, contact the CTR team.</p>
            <Link href={back} className="btn-primary mt-6">
              Back to the module
            </Link>
          </div>
        </main>
      </>
    );
  }

  const initial: FormAnswers = { ...(resp?.answers_json ?? {}) };
  for (const q of form.questions) if (q.prefill === "residentName" && !initial[q.id]) initial[q.id] = displayName(r);
  const questions = form.questions.map((q) => ({ ...q, resolvedOptions: questionOptions(q, settings) }));

  return (
    <>
      <ResidentHeader name={displayName(r)} />
      <main id="main" className="mx-auto max-w-2xl px-4 py-6">
        <p>
          <Link href={back} className="link">
            ← Back
          </Link>
        </p>
        <h1 className="h1 mt-4">{form.title}</h1>
        <p className="mt-3 rounded-xl border-2 border-teal bg-teal-wash p-3 font-semibold">🔒 {form.visibilityNotice}</p>
        <p className="mt-4 text-lg">{form.intro}</p>
        <p className="mt-2 text-sm text-muted">Your answers save as a draft while you work. Questions marked * are required.</p>
        <div className="mt-6">
          <ResidentForm
            questions={questions}
            initial={initial}
            saveDraft={saveFormDraft.bind(null, form.slug)}
            submit={submitForm.bind(null, form.slug)}
            back={back}
          />
        </div>
      </main>
    </>
  );
}
