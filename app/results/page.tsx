import Link from "next/link";
import { MODULES, moduleReflectionPrompts } from "@/lib/content";
import { displayName, getConfig, loadBundle } from "@/lib/data";
import { formatDateTime, todayISO } from "@/lib/dates";
import { accuracyText, moduleState } from "@/lib/progress";
import { requireResident } from "@/lib/session";
import { ResidentHeader } from "@/components/ResidentHeader";
import { StatusChip } from "@/components/StatusChip";

export const dynamic = "force-dynamic";

export default async function Results() {
  const r = await requireResident();
  const cfg = await getConfig(todayISO());
  const b = await loadBundle(r.id);
  return (
    <>
      <ResidentHeader name={displayName(r)} />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <p>
          <Link href="/home" className="link">
            ← Back to my dashboard
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="h1">My scores and reflections</h1>
          <a href="/results/download" className="btn-secondary">
            Download my responses
          </a>
        </div>
        <p className="text-muted">Only you and the CTR team can see these.</p>
        {MODULES.map((m) => {
          const st = moduleState(cfg, r, b, m);
          const prompts = moduleReflectionPrompts(m);
          return (
            <section key={m.slug} className="card space-y-3" aria-labelledby={`r-${m.slug}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`r-${m.slug}`} className="h2">
                  {m.number}. {m.title}
                </h2>
                <StatusChip status={st.status} />
              </div>
              {st.totalQuestions > 0 && (
                <p>
                  <strong>Accuracy (best attempt):</strong> {accuracyText(st)}
                  {st.attemptCount > 0 && <span className="text-muted"> · {st.attemptCount} attempt{st.attemptCount === 1 ? "" : "s"}</span>}
                </p>
              )}
              {prompts.map((p) => {
                const rf = b.reflections.find((x) => x.prompt_id === p.promptId);
                return (
                  <div key={p.promptId} className="rounded-xl bg-sand p-3">
                    <p className="font-semibold">{p.prompt}</p>
                    <p className="mt-1 whitespace-pre-wrap">{rf?.response_text?.trim() || <span className="text-muted">No response yet.</span>}</p>
                    {rf?.response_text && <p className="mt-1 text-sm text-muted">Saved {formatDateTime(rf.updated_at)}</p>}
                  </div>
                );
              })}
            </section>
          );
        })}
      </main>
    </>
  );
}
