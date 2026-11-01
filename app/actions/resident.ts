"use server";

// Every action identifies the resident from the signed cookie only.
// Ids that arrive from the browser are content ids (module, question, item), validated against /content.
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { ActivityBlock, findActivity, getForm, ModuleContent, moduleActivities, moduleChecklistItems, moduleReflectionPrompts } from "@/lib/content";
import { ActivityPayload, evaluateActivity, fieldsComplete, personaLineFrom } from "@/lib/activities";
import { deleteStored, prepareUpload, PreparedUpload } from "@/lib/storage";
import { displayName, getConfig, getResolvedContent, getSettings, loadBundle, Resident } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { itemStates, moduleState } from "@/lib/progress";
import { requireResident } from "@/lib/session";
import { validateAnswers, FormAnswers } from "@/lib/forms";

const MAX_TEXT = 20_000;

/** Module content with admin edits applied (quiz answer keys and matching cards can be edited). */
async function getModule(slug: string) {
  return (await getResolvedContent()).modules.find((m) => m.slug === slug);
}

async function touchModule(residentId: string, slug: string) {
  await sql`
    insert into module_progress (resident_id, module_slug, started_at, last_active_at)
    values (${residentId}, ${slug}, now(), now())
    on conflict (resident_id, module_slug) do update set last_active_at = now()`;
}

export async function toggleItemCheck(itemId: string, checked: boolean) {
  const r = await requireResident();
  const cfg = await getConfig(todayISO());
  const item = cfg.phaseItems.find((i) => i.id === itemId);
  if (!item) return { ok: false };
  const state = itemStates(cfg, r, await loadBundle(r.id), item.phase).find((s) => s.item.id === itemId);
  if (!state?.visible) return { ok: false };
  await sql`
    insert into item_checks (resident_id, item_id, checked, checked_at)
    values (${r.id}, ${itemId}, ${checked}, ${checked ? sql`now()` : null})
    on conflict (resident_id, item_id) do update
      set checked = excluded.checked, checked_at = excluded.checked_at,
          verified = case when excluded.checked then item_checks.verified else false end`;
  revalidatePath("/home");
  return { ok: true };
}

export async function toggleChecklist(moduleSlug: string, itemId: string, checked: boolean) {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  if (!m) return { ok: false };
  if (!moduleChecklistItems(m).some((i) => i.id === itemId)) return { ok: false };
  // Form-linked items are ticked by submitting the form, not by hand.
  if (m.sections.some((s) => s.blocks.some((b) => b.type === "form" && b.checklistItemId === itemId))) return { ok: false };
  await touchModule(r.id, m.slug);
  await sql`
    insert into checklist_items (resident_id, module_slug, item_id, checked, checked_at)
    values (${r.id}, ${m.slug}, ${itemId}, ${checked}, ${checked ? sql`now()` : null})
    on conflict (resident_id, module_slug, item_id) do update
      set checked = excluded.checked, checked_at = excluded.checked_at,
          verified = case when excluded.checked then checklist_items.verified else false end`;
  return { ok: true };
}

export async function markModuleOpened(moduleSlug: string) {
  const r = await requireResident();
  if (!(await getModule(moduleSlug))) return;
  await touchModule(r.id, moduleSlug);
}

export type AnswerResult =
  | { ok: true; correct: boolean; correctOption: string; explanation: string }
  | { ok: false; error: string };

export async function answerQuestion(moduleSlug: string, questionId: string, optionId: string, attemptNo: number): Promise<AnswerResult> {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  const q = m?.quiz?.questions.find((x) => x.id === questionId);
  if (!m || !q || !q.options.some((o) => o.id === optionId)) return { ok: false, error: "Unknown question." };
  const [{ max }] = await sql<{ max: number | null }[]>`
    select max(attempt_no) as max from quiz_attempts where resident_id = ${r.id} and module_slug = ${m.slug}`;
  const current = max ?? 1;
  if (!Number.isInteger(attemptNo) || attemptNo < current || attemptNo > current + 1) return { ok: false, error: "Please reload the page." };
  const correct = optionId === q.correct;
  await touchModule(r.id, m.slug);
  const inserted = await sql`
    insert into quiz_attempts (resident_id, module_slug, attempt_no, question_id, selected_option, is_correct)
    values (${r.id}, ${m.slug}, ${attemptNo}, ${q.id}, ${optionId}, ${correct})
    on conflict (resident_id, module_slug, attempt_no, question_id) do nothing
    returning id`;
  if (inserted.length === 0) return { ok: false, error: "You already answered this question in this attempt." };
  return { ok: true, correct, correctOption: q.correct, explanation: q.explanation };
}

export async function saveReflection(moduleSlug: string, promptId: string, text: string) {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  if (!m || !moduleReflectionPrompts(m).some((p) => p.promptId === promptId)) return { ok: false };
  await touchModule(r.id, m.slug);
  await sql`
    insert into reflections (resident_id, module_slug, prompt_id, response_text, updated_at)
    values (${r.id}, ${m.slug}, ${promptId}, ${String(text).slice(0, MAX_TEXT)}, now())
    on conflict (resident_id, prompt_id) do update set response_text = excluded.response_text, updated_at = now()`;
  return { ok: true, savedAt: new Date().toISOString() };
}

async function activityPayload(residentId: string, slug: string, activityId: string): Promise<ActivityPayload | null> {
  const [row] = await sql<{ payload_json: ActivityPayload }[]>`
    select payload_json from activity_results where resident_id = ${residentId} and module_slug = ${slug} and activity_id = ${activityId}`;
  return row?.payload_json ?? null;
}

async function storeActivity(residentId: string, slug: string, act: ActivityBlock, payload: ActivityPayload, complete: boolean) {
  // Once a matching activity is finished it stays finished.
  await sql`
    insert into activity_results (resident_id, module_slug, activity_id, payload_json, completed_at, updated_at)
    values (${residentId}, ${slug}, ${act.activityId}, ${sql.json(payload as never)}, ${complete ? sql`now()` : null}, now())
    on conflict (resident_id, module_slug, activity_id) do update
      set payload_json = excluded.payload_json, updated_at = now(),
          completed_at = case when ${act.type === "matching"} then coalesce(activity_results.completed_at, excluded.completed_at)
                              when excluded.completed_at is null then null
                              else coalesce(activity_results.completed_at, excluded.completed_at) end`;
}

async function evaluateFor(r: Resident, m: ModuleContent, act: ActivityBlock, raw: Record<string, unknown>) {
  const existing = await activityPayload(r.id, m.slug, act.activityId);
  let personaLine: string | undefined;
  if (act.type === "intro_slide" && act.quizActivityId)
    personaLine = personaLineFrom(m, act.quizActivityId, await activityPayload(r.id, m.slug, act.quizActivityId));
  return evaluateActivity(m, act, raw, existing, { residentName: displayName(r), personaLine });
}

export async function saveActivity(moduleSlug: string, activityId: string, payload: Record<string, unknown>) {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  const act = m && moduleActivities(m).find((a) => a.activityId === activityId);
  if (!m || !act) return { ok: false, complete: false };
  const raw = (payload.answers ?? {}) as Record<string, unknown>;
  const res = await evaluateFor(r, m, act, raw);
  await touchModule(r.id, m.slug);
  await storeActivity(r.id, m.slug, act, res.payload, res.complete);
  return { ok: true, complete: res.complete, result: res.payload.result ?? null, answers: res.payload.answers };
}

// ---------- Resident photo uploads (intro slide) ----------

const PHOTO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function preparePhotoUpload(
  moduleSlug: string,
  activityId: string,
  photoId: string,
  file: { name: string; type: string; size: number },
): Promise<{ ok: true; upload: PreparedUpload } | { ok: false; error: string }> {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  const act = m && findActivity(m, activityId);
  if (act?.type !== "intro_slide" || !act.photos.some((p) => p.id === photoId)) return { ok: false, error: "Unknown photo slot." };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = PHOTO_TYPES[ext];
  if (!type) return { ok: false, error: "Please choose a photo: .jpg, .png, or .webp. (iPhone photos upload as .jpg from the photo picker.)" };
  if (!(file.size > 0) || file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Photos must be under 10 MB." };
  try {
    return { ok: true, upload: await prepareUpload(`residents/${r.id}/${randomUUID()}.${ext}`, type) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function finishPhotoUpload(
  moduleSlug: string,
  activityId: string,
  photoId: string,
  info: { storagePath: string; publicUrl: string; filename: string; contentType: string; size: number },
): Promise<{ ok: boolean; complete?: boolean; url?: string }> {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  const act = m && findActivity(m, activityId);
  const prefix = `residents/${r.id}/`;
  if (!m || act?.type !== "intro_slide" || !act.photos.some((p) => p.id === photoId)) return { ok: false };
  if (!info.storagePath.startsWith(prefix) || !/^[\w.-]+$/.test(info.storagePath.slice(prefix.length))) return { ok: false };
  await sql`insert into media_files (storage_path, public_url, filename, content_type, size_bytes)
            values (${info.storagePath}, ${info.publicUrl}, ${info.filename.slice(0, 200)}, ${info.contentType}, ${info.size})`;
  const existing = await activityPayload(r.id, m.slug, act.activityId);
  const old = existing?.photos?.[photoId];
  const photos = { ...(existing?.photos ?? {}), [photoId]: info.publicUrl };
  const res = await evaluateFor(r, m, act, existing?.answers ?? {});
  res.payload.photos = photos;
  const done = fieldsComplete(act.fields, res.payload.answers) && act.photos.every((p) => p.optional || !!photos[p.id]);
  await touchModule(r.id, m.slug);
  await storeActivity(r.id, m.slug, act, res.payload, done);
  if (old) await removeStoredFile(old);
  return { ok: true, complete: done, url: info.publicUrl };
}

export async function removePhoto(moduleSlug: string, activityId: string, photoId: string): Promise<{ ok: boolean; complete?: boolean }> {
  const r = await requireResident();
  const m = await getModule(moduleSlug);
  const act = m && findActivity(m, activityId);
  if (!m || act?.type !== "intro_slide") return { ok: false };
  const existing = await activityPayload(r.id, m.slug, act.activityId);
  const old = existing?.photos?.[photoId];
  const photos = { ...(existing?.photos ?? {}) };
  delete photos[photoId];
  const answers = existing?.answers ?? {};
  const done = fieldsComplete(act.fields, answers) && act.photos.every((p) => p.optional || !!photos[p.id]);
  await storeActivity(r.id, m.slug, act, { answers, photos }, done);
  if (old) await removeStoredFile(old);
  return { ok: true, complete: done };
}

async function removeStoredFile(url: string) {
  const [f] = await sql<{ id: string; storage_path: string }[]>`select id, storage_path from media_files where public_url = ${url}`;
  if (!f) return;
  await deleteStored(f.storage_path);
  await sql`delete from media_files where id = ${f.id}`;
}

export async function completeModule(moduleSlug: string) {
  const r = await requireResident();
  const cfg = await getConfig(todayISO());
  const m = cfg.content.find((x) => x.slug === moduleSlug);
  if (!m) return { ok: false, missing: ["Unknown module"] };
  const state = moduleState(cfg, r, await loadBundle(r.id), m);
  if (!state.ruleMet) return { ok: false, missing: state.missing };
  await sql`
    insert into module_progress (resident_id, module_slug, started_at, completed_at, last_active_at)
    values (${r.id}, ${m.slug}, now(), now(), now())
    on conflict (resident_id, module_slug) do update
      set completed_at = coalesce(module_progress.completed_at, now()), last_active_at = now()`;
  revalidatePath("/home");
  return { ok: true, missing: [] };
}

// ---------- In-app forms ----------

export async function saveFormDraft(formSlug: string, answers: FormAnswers) {
  const r = await requireResident();
  const form = getForm(formSlug);
  if (!form) return { ok: false, error: "Unknown form." };
  const { clean } = validateAnswers(form, answers, await getSettings());
  const rows = await sql`
    insert into form_responses (resident_id, form_slug, answers_json, status, updated_at)
    values (${r.id}, ${form.slug}, ${sql.json(clean as never)}, 'draft', now())
    on conflict (resident_id, form_slug) do update
      set answers_json = excluded.answers_json, updated_at = now()
      where form_responses.status = 'draft'
    returning status`;
  if (rows.length === 0) return { ok: false, error: "This form has already been submitted." };
  if (form.linkedChecklist) await touchModule(r.id, form.linkedChecklist.moduleSlug);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function submitForm(formSlug: string, answers: FormAnswers): Promise<{ ok: boolean; errors: Record<string, string> }> {
  const r = await requireResident();
  const form = getForm(formSlug);
  if (!form) return { ok: false, errors: { _: "Unknown form." } };
  const { clean, errors } = validateAnswers(form, answers, await getSettings());
  if (Object.keys(errors).length) return { ok: false, errors };
  const rows = await sql`
    insert into form_responses (resident_id, form_slug, answers_json, status, submitted_at, updated_at)
    values (${r.id}, ${form.slug}, ${sql.json(clean as never)}, 'submitted', now(), now())
    on conflict (resident_id, form_slug) do update
      set answers_json = excluded.answers_json, status = 'submitted', submitted_at = now(), updated_at = now()
      where form_responses.status = 'draft'
    returning status`;
  if (rows.length === 0) return { ok: false, errors: { _: "This form has already been submitted." } };
  if (form.linkedChecklist) {
    const { moduleSlug, itemId } = form.linkedChecklist;
    await touchModule(r.id, moduleSlug);
    await sql`
      insert into checklist_items (resident_id, module_slug, item_id, checked, checked_at)
      values (${r.id}, ${moduleSlug}, ${itemId}, true, now())
      on conflict (resident_id, module_slug, item_id) do update set checked = true, checked_at = now()`;
  }
  revalidatePath("/home");
  return { ok: true, errors: {} };
}
