import Link from "next/link";
import { notFound } from "next/navigation";
import { Block, getModule, LINK_SETTINGS, Section } from "@/lib/content";
import { getResolvedContent, getSettings } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { videoEmbed } from "@/lib/embed";
import { storageMode } from "@/lib/storage";
import type { OverrideStatus } from "@/lib/contentOverrides";
import {
  removeAudio,
  resetTarget,
  saveActivity,
  saveBlock,
  saveModuleMeta,
  saveQuestion,
  saveReflectionPrompt,
  saveSection,
} from "@/app/actions/content";
import { Flash } from "@/components/Flash";
import { AudioPlayer, VideoPlayer } from "@/components/Media";
import { AudioUploader } from "../AudioUploader";
import { ScrollToSaved } from "../ScrollToSaved";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const LINK_LABEL = new Map(LINK_SETTINGS.map((d) => [d.key, d.label]));

function EditState({ st, slug, target, anchor }: { st: OverrideStatus | undefined; slug: string; target: string; anchor: string }) {
  if (!st) return <span className="text-sm text-muted">Original</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full bg-yellow px-2 py-0.5 font-bold">Edited {formatDateTime(st.updatedAt)}</span>
      {st.stale && (
        <span className="font-semibold text-coral-ink">
          {st.applied ? "The original changed since this edit; check it still reads right." : "Not shown: the original changed since this edit. Re-enter it or reset."}
        </span>
      )}
      <form action={resetTarget.bind(null, slug, target, anchor)}>
        <button className="link text-sm">Reset to original</button>
      </form>
    </span>
  );
}

function SaveBar({ label = "Save" }: { label?: string }) {
  return (
    <div className="pt-2">
      <button type="submit" className="btn-small">
        {label}
      </button>
    </div>
  );
}

function UrlField({ settingKey, value, video }: { settingKey: string; value: string; video?: boolean }) {
  const embed = video ? videoEmbed(value) : null;
  return (
    <label className="block">
      <span className="label">
        {LINK_LABEL.get(settingKey) ?? "Link"} {!value && <span className="ml-1 rounded bg-yellow px-1 text-xs font-bold">empty</span>}
      </span>
      <input name={`set__${settingKey}`} type="url" defaultValue={value} placeholder="https://" className="input" />
      {video && (
        <span className="mt-1 block text-sm text-muted">
          {value
            ? embed
              ? `✓ Plays inside the page (${embed.kind === "iframe" ? embed.provider : "video file"}).`
              : "This link opens in a new tab. YouTube, Vimeo, and Google Drive links play inside the page."
            : "YouTube, Vimeo, and Google Drive links play inside the page. For Drive, share the file as “Anyone with the link.”"}
        </span>
      )}
    </label>
  );
}

export default async function EditModule({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const original = getModule(slug);
  if (!original) notFound();
  const { modules, status } = await getResolvedContent();
  const m = modules.find((x) => x.slug === slug)!;
  const settings = await getSettings();
  const st = new Map((status.get(slug) ?? []).map((s) => [s.target, s]));
  const mode = storageMode();

  function blockForm(sec: Section, blk: Block, i: number) {
    const target = `block:${sec.id}:${i}`;
    const anchor = `blk-${sec.id}-${i}`;
    const action = saveBlock.bind(null, slug, sec.id, i);
    const wrap = (title: string, body: React.ReactNode, state = <EditState st={st.get(target)} slug={slug} target={target} anchor={anchor} />) => (
      <div key={anchor} id={anchor} className="scroll-mt-24 rounded-xl border border-gray-brand/30 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold uppercase tracking-wide text-muted">{title}</span>
          {state}
        </div>
        {body}
      </div>
    );
    switch (blk.type) {
      case "text":
      case "heading":
        return wrap(
          blk.type === "text" ? "Paragraph" : "Subheading",
          <form action={action}>
            <textarea name="text" defaultValue={blk.text} rows={blk.type === "text" ? 4 : 1} className="input" aria-label="Text" />
            <p className="mt-1 text-xs text-muted">Wrap words in **double asterisks** to make them bold.</p>
            <SaveBar />
          </form>,
        );
      case "list":
        return wrap(
          "Bulleted list",
          <form action={action}>
            <textarea name="items" defaultValue={blk.items.join("\n")} rows={Math.max(3, blk.items.length + 1)} className="input" aria-label="List items, one per line" />
            <p className="mt-1 text-xs text-muted">One bullet per line. **Bold** works.</p>
            <SaveBar />
          </form>,
        );
      case "callout":
        return wrap(
          "Callout",
          <form action={action} className="space-y-2">
            <input name="title" defaultValue={blk.title ?? ""} placeholder="Optional label, e.g. Key Idea" className="input" aria-label="Callout label" />
            <textarea name="text" defaultValue={blk.text} rows={3} className="input" aria-label="Callout text" />
            <SaveBar />
          </form>,
        );
      case "quote":
        return wrap(
          "Quote",
          <form action={action} className="space-y-2">
            <textarea name="text" defaultValue={blk.text} rows={3} className="input" aria-label="Quote" />
            <input name="cite" defaultValue={blk.cite ?? ""} placeholder="Who said it" className="input" aria-label="Attribution" />
            <SaveBar />
          </form>,
        );
      case "image":
        return wrap(
          "Image",
          <form action={action}>
            <input name="alt" defaultValue={blk.alt} className="input" aria-label="Image description (alt text)" />
            <SaveBar />
          </form>,
        );
      case "table":
        return wrap(
          "Table",
          <form action={action} className="space-y-2">
            <textarea
              name="table"
              defaultValue={[blk.columns, ...blk.rows].map((r) => r.join(" | ")).join("\n")}
              rows={blk.rows.length + 2}
              className="input font-mono text-sm"
              aria-label="Table: first line is the header; separate cells with |"
            />
            <p className="text-xs text-muted">First line is the header. One row per line; separate cells with a | bar.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sample" defaultChecked={!!blk.sample} className="h-5 w-5 accent-teal-ink" /> Still a draft (show “CTR to confirm” to residents)
            </label>
            <SaveBar />
          </form>,
        );
      case "link":
        return wrap(
          blk.kind === "video" ? "Video" : blk.kind === "audio" ? "Audio link" : "Link",
          <form action={action} className="space-y-2">
            <label className="block">
              <span className="label">Label</span>
              <input name="label" defaultValue={blk.label} className="input" />
            </label>
            <UrlField settingKey={blk.linkKey} value={settings[blk.linkKey] ?? ""} video={blk.kind === "video"} />
            {blk.captionsLinkKey && <UrlField settingKey={blk.captionsLinkKey} value={settings[blk.captionsLinkKey] ?? ""} />}
            <SaveBar />
          </form>,
        );
      case "cards":
        return wrap(
          "Link cards",
          <form action={action} className="space-y-3">
            {blk.cards.map((c, ci) => (
              <fieldset key={ci} className="grid gap-2 rounded-lg bg-sand p-2 md:grid-cols-3">
                <input name={`card_${ci}_title`} defaultValue={c.title} className="input" aria-label={`Card ${ci + 1} title`} />
                <input name={`card_${ci}_subtitle`} defaultValue={c.subtitle ?? ""} className="input" aria-label={`Card ${ci + 1} subtitle`} />
                <input name={`set__${c.linkKey}`} type="url" defaultValue={settings[c.linkKey] ?? ""} placeholder="https://" className="input" aria-label={`Card ${ci + 1} link`} />
              </fieldset>
            ))}
            <SaveBar />
          </form>,
        );
      case "checklist":
        return wrap(
          "Checklist",
          <form action={action} className="space-y-3">
            {blk.items.map((it, ii) => (
              <fieldset key={it.id} className="grid gap-2 rounded-lg bg-sand p-2 md:grid-cols-3">
                <input name={`item_${ii}_label`} defaultValue={it.label} className="input" aria-label={`Item ${ii + 1} label`} />
                <input name={`item_${ii}_description`} defaultValue={it.description ?? ""} placeholder="Optional description" className="input" aria-label={`Item ${ii + 1} description`} />
                {it.linkKey ? (
                  <input name={`set__${it.linkKey}`} type="url" defaultValue={settings[it.linkKey] ?? ""} placeholder="https://" className="input" aria-label={`Item ${ii + 1} link`} />
                ) : (
                  <span className="self-center text-sm text-muted">No link</span>
                )}
              </fieldset>
            ))}
            <SaveBar />
          </form>,
        );
      case "form":
        return wrap(
          "In-app survey link",
          <form action={action}>
            <input name="label" defaultValue={blk.label} className="input" aria-label="Label" />
            <p className="mt-1 text-xs text-muted">Survey questions are edited by request (content/forms).</p>
            <SaveBar />
          </form>,
        );
      case "reflection": {
        const t = `reflection:${blk.promptId}`;
        const a = `refl-${blk.promptId}`;
        return wrap(
          "Reflection prompt",
          <form action={saveReflectionPrompt.bind(null, slug, blk.promptId)}>
            <textarea name="prompt" defaultValue={blk.prompt} rows={2} className="input" aria-label="Reflection prompt" />
            <SaveBar />
          </form>,
          <EditState st={st.get(t)} slug={slug} target={t} anchor={a} />,
        );
      }
      case "matching": {
        const t = `activity:${blk.activityId}`;
        const rows = [...blk.cards, ...Array.from({ length: 4 }, () => ({ id: "", text: "", answer: "" }))];
        return (
          <div key={anchor} id={`act-${blk.activityId}`} className="scroll-mt-24 rounded-xl border-2 border-teal-light p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Matching activity</span>
              <EditState st={st.get(t)} slug={slug} target={t} anchor={`act-${blk.activityId}`} />
            </div>
            <form action={saveActivity.bind(null, slug, blk.activityId)} className="space-y-3">
              <input type="hidden" name="card_count" value={rows.length} />
              <label className="block">
                <span className="label">Title</span>
                <input name="title" defaultValue={blk.title} className="input" />
              </label>
              <label className="block">
                <span className="label">Match options (one per line)</span>
                <textarea name="categories" defaultValue={blk.categories.join("\n")} rows={Math.max(3, blk.categories.length)} className="input" />
              </label>
              <div>
                <p className="label">Cards</p>
                <p className="mb-2 text-sm text-muted">
                  Type the correct match exactly as it appears in the options list. Clear a card&apos;s text to remove it; fill a blank row to add one (save to get more blank
                  rows).
                </p>
                <div className="space-y-2">
                  {rows.map((c, ci) => (
                    <div key={ci} className="grid gap-2 md:grid-cols-[1fr_14rem]">
                      <input type="hidden" name={`card_${ci}_id`} value={c.id} />
                      <input name={`card_${ci}_text`} defaultValue={c.text} placeholder={c.id ? "" : "New card text"} className="input" aria-label={`Card ${ci + 1} text`} />
                      <input name={`card_${ci}_answer`} defaultValue={c.answer} placeholder="Correct match" className="input" aria-label={`Card ${ci + 1} correct match`} list={`cats-${blk.activityId}`} />
                    </div>
                  ))}
                </div>
                <datalist id={`cats-${blk.activityId}`}>
                  {blk.categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sample" defaultChecked={!!blk.sample} className="h-5 w-5 accent-teal-ink" /> Still sample cards (show “Sample cards, replace”)
              </label>
              <SaveBar label="Save activity" />
            </form>
          </div>
        );
      }
      case "scenario": {
        const t = `activity:${blk.activityId}`;
        return (
          <div key={anchor} id={`act-${blk.activityId}`} className="scroll-mt-24 rounded-xl border-2 border-teal-light p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Scenario practice</span>
              <EditState st={st.get(t)} slug={slug} target={t} anchor={`act-${blk.activityId}`} />
            </div>
            <form action={saveActivity.bind(null, slug, blk.activityId)} className="space-y-3">
              <label className="block">
                <span className="label">Scenario</span>
                <textarea name="scenario" defaultValue={blk.scenario} rows={5} className="input" />
              </label>
              {blk.prompts.map((p, pi) => (
                <label key={p.id} className="block">
                  <span className="label">Question {pi + 1}</span>
                  <input name={`prompt_${p.id}`} defaultValue={p.prompt} className="input" />
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sample" defaultChecked={!!blk.sample} className="h-5 w-5 accent-teal-ink" /> Still a sample scenario
              </label>
              <SaveBar label="Save scenario" />
            </form>
          </div>
        );
      }
      case "quiz":
        return (
          <div key={anchor} className="space-y-4">
            {(m.quiz?.questions ?? []).map((q, qi) => {
              const t = `question:${q.id}`;
              return (
                <div key={q.id} id={`q-${q.id}`} className="scroll-mt-24 rounded-xl border-2 border-gray-brand/30 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold uppercase tracking-wide text-muted">Question {qi + 1}</span>
                    <EditState st={st.get(t)} slug={slug} target={t} anchor={`q-${q.id}`} />
                  </div>
                  <form action={saveQuestion.bind(null, slug, q.id)} className="space-y-2">
                    <textarea name="prompt" defaultValue={q.prompt} rows={2} className="input font-semibold" aria-label={`Question ${qi + 1}`} />
                    <fieldset className="space-y-2">
                      <legend className="text-sm text-muted">Choices (select the correct answer)</legend>
                      {q.options.map((o) => (
                        <div key={o.id} className="flex items-start gap-2">
                          <label className="flex min-h-12 items-center gap-1 font-bold">
                            <input type="radio" name="correct" value={o.id} defaultChecked={q.correct === o.id} className="h-5 w-5 accent-teal-ink" aria-label={`${o.id} is correct`} />
                            {o.id}.
                          </label>
                          <textarea name={`opt_${o.id}`} defaultValue={o.text} rows={1} className="input" aria-label={`Choice ${o.id}`} />
                        </div>
                      ))}
                    </fieldset>
                    <label className="block">
                      <span className="label">Explanation (shown after answering)</span>
                      <input name="explanation" defaultValue={q.explanation} className="input" />
                    </label>
                    <SaveBar label="Save question" />
                  </form>
                </div>
              );
            })}
            <p className="text-sm text-muted">
              Changing a correct answer affects new answers only; answers already given keep the score they got. To add or remove questions, ask Claude Code.
            </p>
          </div>
        );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p>
        <Link href="/admin/content" className="link">
          ← All modules
        </Link>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">
          Module {m.number}: {m.title}
        </h1>
        <Link href={`/module/${slug}`} target="_blank" className="btn-small">
          Preview as a resident ↗
        </Link>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <Suspense>
        <ScrollToSaved />
      </Suspense>

      <section id="module" className="card scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Module card</h2>
          <EditState st={st.get("module")} slug={slug} target="module" anchor="module" />
        </div>
        <form action={saveModuleMeta.bind(null, slug)} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
            <label className="block">
              <span className="label">Title</span>
              <input name="title" defaultValue={m.title} className="input" />
            </label>
            <label className="block">
              <span className="label">Minutes</span>
              <input name="estimatedMinutes" type="number" min={1} defaultValue={m.estimatedMinutes} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="label">Short description</span>
            <input name="description" defaultValue={m.description} className="input" />
          </label>
          <label className="block">
            <span className="label">Learning objectives (one per line)</span>
            <textarea name="objectives" defaultValue={m.objectives.join("\n")} rows={m.objectives.length + 1} className="input" />
          </label>
          {m.softDueNote !== undefined && (
            <label className="block">
              <span className="label">Soft-deadline note ({"{softDue}"} is replaced with the date from Settings)</span>
              <input name="softDueNote" defaultValue={m.softDueNote} className="input" />
            </label>
          )}
          <SaveBar />
        </form>
      </section>

      {m.sections.map((sec) => {
        const target = `section:${sec.id}`;
        const anchor = `sec-${sec.id}`;
        const isUploaded = !!sec.audioUrl && (sec.audioUrl.startsWith("/media/") || sec.audioUrl.includes("/storage/v1/object/public/"));
        return (
          <section key={sec.id} className="card space-y-4">
            <div id={anchor} className="scroll-mt-24 space-y-3 rounded-xl bg-teal-wash p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="h2">{sec.title}</h2>
                <EditState st={st.get(target)} slug={slug} target={target} anchor={anchor} />
              </div>
              <form action={saveSection.bind(null, slug, sec.id)} className="space-y-3">
                <label className="block">
                  <span className="label">Section title</span>
                  <input name="title" defaultValue={sec.title} className="input" />
                </label>
                <details open={!!sec.video?.url}>
                  <summary className="cursor-pointer font-semibold text-teal-ink">🎬 Video at the top of this section {sec.video?.url ? "(added)" : "(optional)"}</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="label">Video link (YouTube, Vimeo, or Google Drive)</span>
                      <input name="video_url" type="url" defaultValue={sec.video?.url ?? ""} placeholder="https://www.youtube.com/watch?v=…" className="input" />
                    </label>
                    <label className="block">
                      <span className="label">Video title</span>
                      <input name="video_title" defaultValue={sec.video?.title ?? ""} className="input" />
                    </label>
                    <label className="block">
                      <span className="label">Captions or transcript link (optional)</span>
                      <input name="video_captions" type="url" defaultValue={sec.video?.captionsUrl ?? ""} className="input" />
                    </label>
                  </div>
                  {sec.video?.url && (
                    <div className="mt-3 max-w-lg">
                      <VideoPlayer url={sec.video.url} title={sec.video.title || "Video"} captionsUrl={sec.video.captionsUrl} />
                    </div>
                  )}
                </details>
                <details open={!!sec.audioUrl}>
                  <summary className="cursor-pointer font-semibold text-teal-ink">🎧 Narration audio {sec.audioUrl ? "(added)" : "(optional)"}</summary>
                  <div className="mt-2 space-y-2">
                    {sec.audioUrl && <AudioPlayer url={sec.audioUrl} label="Current audio" />}
                    {!isUploaded && (
                      <label className="block">
                        <span className="label">…or paste a link to an audio file</span>
                        <input name="audioUrl" defaultValue={sec.audioUrl ?? ""} placeholder="https://…/narration.mp3" className="input" />
                      </label>
                    )}
                    <label className="block">
                      <span className="label">Transcript (shown under the player)</span>
                      <textarea name="audioTranscript" defaultValue={sec.audioTranscript ?? ""} rows={3} className="input" />
                    </label>
                  </div>
                </details>
                <SaveBar label="Save section" />
              </form>
              <div className="rounded-lg bg-white p-3">
                {mode === "none" ? (
                  <p className="text-sm">
                    Audio upload needs Supabase Storage. In Vercel, connect Supabase to this project (Storage → Supabase), then redeploy. You can paste an audio link above
                    in the meantime.
                  </p>
                ) : (
                  <AudioUploader slug={slug} sectionId={sec.id} hasAudio={!!sec.audioUrl} />
                )}
                {sec.audioUrl && (
                  <form action={removeAudio.bind(null, slug, sec.id)} className="mt-2">
                    <button className="btn-danger !min-h-8 text-sm">Remove audio</button>
                  </form>
                )}
              </div>
            </div>
            {sec.blocks.map((blk, i) => blockForm(sec, blk, i))}
          </section>
        );
      })}

      <p className="text-sm text-muted">
        Adding, removing, or reordering sections and questions, and editing the Mentor Match survey, is done by asking Claude Code to edit the files in /content.
      </p>
    </div>
  );
}
