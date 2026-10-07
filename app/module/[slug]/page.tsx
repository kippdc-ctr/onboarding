import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Block, moduleChecklistItems } from "@/lib/content";
import { displayName, emptyBundle, getConfig, loadBundle } from "@/lib/data";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { moduleState } from "@/lib/progress";
import { currentResident, isAdmin } from "@/lib/session";
import { ResidentHeader } from "@/components/ResidentHeader";
import { StatusChip } from "@/components/StatusChip";
import { LinkButton } from "@/components/LinkButton";
import { RichText } from "@/components/RichText";
import { AudioPlayer, VideoPlayer } from "@/components/Media";
import { CheckItem } from "@/components/CheckItem";
import { ModuleProgressProvider, Requirement } from "@/components/module/ProgressContext";
import { StickyProgress } from "@/components/module/ProgressBar";
import { Reflection } from "@/components/module/Reflection";
import { Quiz, Feedback } from "@/components/module/Quiz";
import { Matching } from "@/components/module/Matching";
import { Scenario } from "@/components/module/Scenario";
import { CompleteButton } from "@/components/module/CompleteButton";
import { OpenTracker } from "@/components/module/OpenTracker";

export const dynamic = "force-dynamic";

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await currentResident();
  // Admins (not signed in as a resident) get a read-only preview with nothing saved.
  const preview = !r && (await isAdmin());
  if (!r && !preview) redirect("/");
  const cfg = await getConfig(todayISO());
  const m = cfg.content.find((x) => x.slug === slug);
  if (!m) notFound();
  const meta = cfg.modules.find((x) => x.slug === m.slug);
  if (meta && !meta.enabled) notFound();
  const b = r ? await loadBundle(r.id) : emptyBundle();
  const st = moduleState(cfg, r ?? { group_number: null }, b, m);
  const settings = cfg.settings;

  const reflections = new Map(b.reflections.filter((x) => x.module_slug === m.slug).map((x) => [x.prompt_id, x.response_text]));
  const activities = new Map(b.activities.filter((x) => x.module_slug === m.slug).map((x) => [x.activity_id, x]));
  const form = b.forms;
  const questions = m.quiz?.questions ?? [];

  // Current attempt's feedback (so a reload keeps what they've answered this round).
  const attemptRows = b.attempts.filter((a) => a.module_slug === m.slug && a.attempt_no === st.currentAttempt);
  const initialFeedback: Record<string, Feedback> = {};
  for (const a of attemptRows) {
    const q = questions.find((x) => x.id === a.question_id);
    if (q) initialFeedback[q.id] = { selected: a.selected_option, correct: a.is_correct, correctOption: q.correct, explanation: q.explanation };
  }

  // Requirements for the sticky progress bar and the complete button.
  const items = moduleChecklistItems(m);
  const reflPrompts = new Map<string, string>();
  for (const s of m.sections) for (const blk of s.blocks) if (blk.type === "reflection") reflPrompts.set(blk.promptId, blk.prompt);
  const reqs: Requirement[] = [];
  if (m.completion.allQuestions)
    questions.forEach((q, i) => reqs.push({ key: `quiz:${q.id}`, label: `Answer knowledge check question ${i + 1}`, done: st.answered.has(q.id) }));
  for (const id of m.completion.reflections)
    reqs.push({ key: `refl:${id}`, label: `Save the reflection "${truncate(reflPrompts.get(id) ?? id)}"`, done: !!reflections.get(id)?.trim() });
  for (const id of m.completion.checklist)
    reqs.push({ key: `chk:${id}`, label: `Tick "${items.find((i) => i.id === id)?.label ?? id}"`, done: !!st.checklist[id]?.checked });
  for (const id of m.completion.activities) {
    const blk = m.sections.flatMap((s) => s.blocks).find((x) => (x.type === "matching" || x.type === "scenario") && x.activityId === id);
    const label = blk?.type === "matching" ? `Finish "${blk.title}"` : "Save the scenario practice";
    reqs.push({ key: `act:${id}`, label, done: !!activities.get(id)?.completed_at });
  }

  function renderBlock(blk: Block, key: string) {
    switch (blk.type) {
      case "text":
        return (
          <p key={key} className="text-lg">
            <RichText text={blk.text} />
          </p>
        );
      case "heading":
        return (
          <h3 key={key} className="h3 pt-2">
            {blk.text}
          </h3>
        );
      case "list":
        return (
          <ul key={key} className="list-disc space-y-1 pl-6 text-lg">
            {blk.items.map((it, i) => (
              <li key={i}>
                <RichText text={it} />
              </li>
            ))}
          </ul>
        );
      case "callout":
        return (
          <div key={key} className="rounded-2xl border-l-8 border-yellow bg-yellow-wash p-4 text-lg">
            {blk.title && <p className="mb-1 text-sm font-bold uppercase tracking-wide text-ink">{blk.title}</p>}
            <p className="font-semibold">
              <RichText text={blk.text} />
            </p>
          </div>
        );
      case "quote":
        return (
          <figure key={key} className="rounded-2xl border-l-8 border-teal bg-teal-wash p-4">
            <blockquote className="text-lg italic">&ldquo;{blk.text}&rdquo;</blockquote>
            {blk.cite && <figcaption className="mt-2 font-semibold text-teal-ink">— {blk.cite}</figcaption>}
          </figure>
        );
      case "image":
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={key} src={blk.src} alt={blk.alt} className="w-full rounded-2xl" />;
      case "link":
        if (blk.kind === "video")
          return <VideoPlayer key={key} url={settings[blk.linkKey]} title={blk.label.replace(/^Watch:\s*/, "")} captionsUrl={blk.captionsLinkKey ? settings[blk.captionsLinkKey] : null} />;
        return (
          <div key={key} className="flex flex-wrap items-center gap-3">
            <LinkButton href={settings[blk.linkKey]} label={blk.label} kind={blk.kind} />
            {blk.captionsLinkKey && <LinkButton href={settings[blk.captionsLinkKey]} label="Captions / transcript" variant="small" />}
          </div>
        );
      case "cards":
        return (
          <ul key={key} className="grid gap-3 sm:grid-cols-2">
            {blk.cards.map((c) => (
              <li key={c.title} className="flex flex-col gap-2 rounded-2xl border-2 border-teal-light p-4">
                <span className="text-lg font-bold">{c.title}</span>
                {c.subtitle && <span className="text-muted">{c.subtitle}</span>}
                <span className="mt-auto">
                  <LinkButton href={settings[c.linkKey]} label={c.kind === "article" ? "Read" : "Watch"} kind={c.kind} variant="small" />
                </span>
              </li>
            ))}
          </ul>
        );
      case "table":
        return (
          <div key={key}>
            {blk.sample && <p className="mb-2 inline-block rounded bg-yellow px-2 text-sm font-bold">Draft content: CTR to confirm</p>}
            <div className="overflow-x-auto rounded-2xl border border-gray-brand/30">
              <table className="w-full min-w-[32rem] text-left text-base">
                <thead className="bg-teal-wash">
                  <tr>
                    {blk.columns.map((c) => (
                      <th key={c} scope="col" className="p-3 font-bold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blk.rows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-brand/20 align-top">
                      {row.map((cell, j) =>
                        j === 0 ? (
                          <th key={j} scope="row" className="p-3 font-semibold">
                            {cell}
                          </th>
                        ) : (
                          <td key={j} className="p-3">
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "reflection":
        return <Reflection key={key} moduleSlug={m!.slug} promptId={blk.promptId} prompt={blk.prompt} initial={reflections.get(blk.promptId) ?? ""} rows={blk.rows} />;
      case "checklist":
        return (
          <ul key={key} className="rounded-2xl border-2 border-gray-brand/25 px-4">
            {blk.items.map((it) => (
              <CheckItem
                key={it.id}
                target={{ kind: "module", moduleSlug: m!.slug, itemId: it.id }}
                label={it.optional ? `${it.label} (optional)` : it.label}
                description={it.description}
                checked={!!st.checklist[it.id]?.checked}
                verified={!!st.checklist[it.id]?.verified}
                progressKey={`chk:${it.id}`}
              >
                {it.linkKey && <LinkButton href={settings[it.linkKey]} label="Open" variant="small" />}
              </CheckItem>
            ))}
          </ul>
        );
      case "form": {
        const resp = form.find((f) => f.form_slug === blk.formSlug);
        const submitted = resp?.status === "submitted";
        return (
          <div key={key} className="flex flex-col gap-3 rounded-2xl border-2 border-gray-brand/25 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold">
                {submitted ? "✓ " : ""}
                {blk.label}
              </p>
              <p className="text-muted">
                {submitted
                  ? `Submitted ${formatDateTime(resp!.submitted_at)}. This checks off automatically.`
                  : resp
                    ? "Draft saved. Pick up where you left off."
                    : "Takes about 10 minutes. Submitting it checks this off automatically."}
              </p>
            </div>
            {!submitted && (
              <Link href={`/form/${blk.formSlug}`} className="btn-primary">
                {resp ? "Continue survey" : "Start survey"}
              </Link>
            )}
          </div>
        );
      }
      case "quiz":
        return (
          <Quiz
            key={key}
            moduleSlug={m!.slug}
            questions={questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options }))}
            attemptNo={st.currentAttempt}
            initialFeedback={initialFeedback}
            bestScore={st.bestScore}
            attemptCount={st.attemptCount}
          />
        );
      case "matching": {
        const a = activities.get(blk.activityId);
        return (
          <Matching
            key={key}
            moduleSlug={m!.slug}
            activityId={blk.activityId}
            title={blk.title}
            categories={blk.categories}
            cards={blk.cards}
            sample={blk.sample}
            initial={((a?.payload_json as { answers?: Record<string, string> })?.answers ?? {}) as Record<string, string>}
            initiallyComplete={!!a?.completed_at}
          />
        );
      }
      case "scenario": {
        const a = activities.get(blk.activityId);
        return (
          <Scenario
            key={key}
            moduleSlug={m!.slug}
            activityId={blk.activityId}
            scenario={blk.scenario}
            prompts={blk.prompts}
            sample={blk.sample}
            initial={((a?.payload_json as { answers?: Record<string, string> })?.answers ?? {}) as Record<string, string>}
          />
        );
      }
    }
  }

  return (
    <>
      {r ? (
        <>
          <ResidentHeader name={displayName(r)} />
          <OpenTracker moduleSlug={m.slug} />
        </>
      ) : (
        <div className="bg-yellow px-4 py-2 text-center font-semibold">
          Admin preview: this is what residents see. Answers and ticks are turned off here.{" "}
          <Link href={`/admin/content/${m.slug}`} className="underline">
            Back to the editor
          </Link>
        </div>
      )}
      <ModuleProgressProvider initial={reqs}>
        <main id="main" className="mx-auto max-w-3xl px-4 pb-16">
          <fieldset disabled={preview} className="m-0 min-w-0 border-0 p-0">
          <StickyProgress title={`Module ${m.number}: ${m.title}`} completed={st.status === "complete"} />
          <p className="mt-4">
            <Link href="/home" className="link">
              ← Back to my dashboard
            </Link>
          </p>
          <header className="mt-4">
            <p className="text-sm font-bold uppercase tracking-wide text-muted">
              Module {m.number}
              {m.badge && <span className="ml-2 rounded-full bg-yellow px-2 py-0.5 text-xs text-ink">{m.badge}</span>}
            </p>
            <h1 className="h1 mt-1">{m.title}</h1>
            <p className="mt-2 text-lg">{m.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-base">
              <StatusChip status={st.status} />
              <span>Due {formatDate(st.due, { weekday: true })}</span>
              <span className="text-muted">About {m.estimatedMinutes} minutes</span>
            </div>
            {meta?.soft_due_date && m.softDueNote && (
              <p className="mt-3 rounded-xl bg-yellow-wash p-3 font-semibold">{m.softDueNote.replace("{softDue}", formatDateTime(meta.soft_due_date))}</p>
            )}
            <p className="mt-3 text-sm text-muted">Your reflections and answers are visible only to you and the CTR team.</p>
          </header>

          <section className="card mt-6" aria-labelledby="obj-h">
            <h2 id="obj-h" className="h3">
              What you&apos;ll learn
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {m.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </section>

          {m.sections.map((s, si) => (
            <section key={s.id} id={s.id} className="card mt-6 scroll-mt-32 space-y-4" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className="h2">
                {s.title}
              </h2>
              {s.audioUrl && <AudioPlayer url={s.audioUrl} transcript={s.audioTranscript} />}
              {s.video?.url && <VideoPlayer url={s.video.url} title={s.video.title || "Video"} captionsUrl={s.video.captionsUrl} />}
              {s.blocks.map((blk, bi) => renderBlock(blk, `${si}-${bi}`))}
            </section>
          ))}

          <div className="mt-8">
            <CompleteButton moduleSlug={m.slug} completed={st.status === "complete"} />
          </div>

          <p className="mt-6 text-center">
            {settings[m.geniallyLinkKey] ? (
              <a className="link" href={settings[m.geniallyLinkKey]} target="_blank" rel="noopener noreferrer">
                {m.geniallyLabel ?? "View original on Genially"} ↗
              </a>
            ) : null}
          </p>
          </fieldset>
        </main>
      </ModuleProgressProvider>
    </>
  );
}

function truncate(s: string, n = 60) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
