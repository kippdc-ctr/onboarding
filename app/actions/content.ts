"use server";

// Admin content editor. Every action starts with requireAdmin(): server actions are public endpoints.
// Edits are stored as overrides on top of the /content files; "reset" deletes the override.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { Block, getModule, LINK_SETTINGS, ModuleContent } from "@/lib/content";
import { hashOf, originalFor } from "@/lib/contentOverrides";
import { requireAdmin } from "@/lib/session";
import { deleteStored, MAX_AUDIO_BYTES, prepareUpload, PreparedUpload } from "@/lib/storage";

const MAX = 20_000;
const LINK_KEYS = new Set(LINK_SETTINGS.map((d) => d.key));

function str(fd: FormData, k: string, max = MAX): string {
  return String(fd.get(k) ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}
function lines(fd: FormData, k: string): string[] {
  return str(fd, k)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
function moduleOr404(slug: string): ModuleContent {
  const m = getModule(slug);
  if (!m) throw new Error("Unknown module");
  return m;
}
function done(slug: string, anchor: string, msg = "Saved. Residents see the change right away."): never {
  redirect(`/admin/content/${slug}?ok=${encodeURIComponent(msg)}&t=${Date.now()}#${anchor}`);
}
function fail(slug: string, anchor: string, msg: string): never {
  redirect(`/admin/content/${slug}?error=${encodeURIComponent(msg)}&t=${Date.now()}#${anchor}`);
}
function cleanUrl(v: string): string {
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Store an override, or remove it if the value matches the original file. */
async function put(m: ModuleContent, target: string, value: Record<string, unknown>) {
  const orig = originalFor(m, target);
  if (orig === undefined) throw new Error("Unknown content item");
  const same = Object.entries(value).every(([k, v]) => JSON.stringify(v ?? "") === JSON.stringify((orig as Record<string, unknown>)[k] ?? ""));
  if (same) await sql`delete from content_overrides where module_slug = ${m.slug} and target = ${target}`;
  else
    await sql`
      insert into content_overrides (module_slug, target, value, original_hash, updated_at)
      values (${m.slug}, ${target}, ${sql.json(value as never)}, ${hashOf(orig)}, now())
      on conflict (module_slug, target) do update set value = excluded.value, original_hash = excluded.original_hash, updated_at = now()`;
  revalidatePath("/", "layout");
}

async function existing(slug: string, target: string): Promise<Record<string, unknown>> {
  const [row] = await sql<{ value: Record<string, unknown> }[]>`select value from content_overrides where module_slug = ${slug} and target = ${target}`;
  return row?.value ?? {};
}

/** Links shown in content live in Settings; the editor saves them there too. */
async function saveLinkFields(fd: FormData) {
  for (const [k, raw] of fd.entries()) {
    if (!k.startsWith("set__")) continue;
    const key = k.slice(5);
    if (!LINK_KEYS.has(key)) continue;
    const v = cleanUrl(String(raw).trim());
    await sql`insert into settings (key, value) values (${key}, ${v}) on conflict (key) do update set value = excluded.value`;
  }
}

// ---------- Module, section, reset ----------

export async function saveModuleMeta(slug: string, fd: FormData) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const minutes = Number(str(fd, "estimatedMinutes"));
  const value: Record<string, unknown> = {
    title: str(fd, "title", 200) || m.title,
    description: str(fd, "description", 1000),
    estimatedMinutes: Number.isInteger(minutes) && minutes > 0 && minutes < 1000 ? minutes : m.estimatedMinutes,
    objectives: lines(fd, "objectives"),
  };
  if (m.softDueNote !== undefined) value.softDueNote = str(fd, "softDueNote", 500) || m.softDueNote;
  await put(m, "module", value);
  done(slug, "module");
}

export async function saveSection(slug: string, sectionId: string, fd: FormData) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const target = `section:${sectionId}`;
  const orig = originalFor(m, target) as Record<string, unknown> | undefined;
  if (!orig) fail(slug, `sec-${sectionId}`, "Unknown section.");
  const prev = await existing(slug, target);
  const videoUrl = cleanUrl(str(fd, "video_url", 2000));
  const value = {
    ...orig,
    ...prev,
    title: str(fd, "title", 200) || (orig.title as string),
    audioUrl: fd.has("audioUrl") ? cleanUrlOrPath(str(fd, "audioUrl", 2000)) : (prev.audioUrl ?? orig.audioUrl),
    audioTranscript: str(fd, "audioTranscript"),
    video: videoUrl ? { title: str(fd, "video_title", 200), url: videoUrl, captionsUrl: cleanUrl(str(fd, "video_captions", 2000)) } : null,
  };
  await put(m, target, value);
  done(slug, `sec-${sectionId}`);
}

function cleanUrlOrPath(v: string) {
  return v.startsWith("/") ? v : cleanUrl(v);
}

export async function resetTarget(slug: string, target: string, anchor: string) {
  await requireAdmin();
  moduleOr404(slug);
  if (target.startsWith("section:")) {
    const prev = await existing(slug, target);
    await removeMediaFile(prev.audioUrl as string | undefined);
  }
  await sql`delete from content_overrides where module_slug = ${slug} and target = ${target}`;
  revalidatePath("/", "layout");
  done(slug, anchor, "Reset to the original.");
}

// ---------- Blocks ----------

export async function saveBlock(slug: string, sectionId: string, index: number, fd: FormData) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const target = `block:${sectionId}:${index}`;
  const anchor = `blk-${sectionId}-${index}`;
  const b = originalFor(m, target) as Block | undefined;
  if (!b) fail(slug, anchor, "Unknown content block.");
  await saveLinkFields(fd);
  let value: Record<string, unknown> = {};
  switch (b.type) {
    case "text":
    case "heading":
      value = { text: str(fd, "text") };
      break;
    case "list":
      value = { items: lines(fd, "items") };
      break;
    case "callout":
      value = { title: str(fd, "title", 200) || undefined, text: str(fd, "text") };
      break;
    case "quote":
      value = { text: str(fd, "text"), cite: str(fd, "cite", 200) || undefined };
      break;
    case "image":
      value = { alt: str(fd, "alt", 500) };
      break;
    case "table": {
      const rows = lines(fd, "table").map((l) => l.split("|").map((c) => c.trim()));
      if (rows.length < 2) fail(slug, anchor, "A table needs a header line and at least one row.");
      const width = rows[0].length;
      value = { columns: rows[0], rows: rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")), sample: fd.get("sample") === "on" };
      break;
    }
    case "link":
      value = { label: str(fd, "label", 300) || b.label };
      break;
    case "cards":
      value = { cards: b.cards.map((c, i) => ({ ...c, title: str(fd, `card_${i}_title`, 200) || c.title, subtitle: str(fd, `card_${i}_subtitle`, 300) })) };
      break;
    case "checklist":
      value = { items: b.items.map((it, i) => ({ ...it, label: str(fd, `item_${i}_label`, 300) || it.label, description: str(fd, `item_${i}_description`, 1000) || undefined })) };
      break;
    case "form":
      value = { label: str(fd, "label", 300) || b.label };
      break;
    default:
      fail(slug, anchor, "This block is edited elsewhere on the page.");
  }
  // Strip undefined so "same as original" comparisons work.
  value = JSON.parse(JSON.stringify(value));
  const origFields = Object.fromEntries(Object.keys(value).map((k) => [k, (b as Record<string, unknown>)[k]]));
  if (JSON.stringify(origFields) === JSON.stringify(value)) {
    await sql`delete from content_overrides where module_slug = ${slug} and target = ${target}`;
    revalidatePath("/", "layout");
  } else await put(m, target, value);
  done(slug, anchor);
}

// ---------- Quiz questions ----------

export async function saveQuestion(slug: string, questionId: string, fd: FormData) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const q = m.quiz?.questions.find((x) => x.id === questionId);
  const anchor = `q-${questionId}`;
  if (!q) fail(slug, anchor, "Unknown question.");
  const correct = str(fd, "correct", 5);
  if (!q.options.some((o) => o.id === correct)) fail(slug, anchor, "Choose the correct answer.");
  const options = q.options.map((o) => ({ id: o.id, text: str(fd, `opt_${o.id}`, 1000) || o.text }));
  await put(m, `question:${questionId}`, { prompt: str(fd, "prompt", 2000) || q.prompt, options, correct, explanation: str(fd, "explanation", 2000) });
  done(slug, anchor);
}

// ---------- Reflection prompts ----------

export async function saveReflectionPrompt(slug: string, promptId: string, fd: FormData) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const anchor = `refl-${promptId}`;
  const prompt = str(fd, "prompt", 2000);
  if (!prompt) fail(slug, anchor, "The prompt can't be empty.");
  await put(m, `reflection:${promptId}`, { prompt });
  done(slug, anchor);
}

// ---------- Practice activities ----------

export async function saveActivity(slug: string, activityId: string, fd: FormData) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const anchor = `act-${activityId}`;
  const a = originalFor(m, `activity:${activityId}`) as Block | undefined;
  if (!a || (a.type !== "matching" && a.type !== "scenario")) fail(slug, anchor, "Unknown activity.");
  const sample = fd.get("sample") === "on";
  if (a.type === "matching") {
    const categories = [...new Set(lines(fd, "categories"))];
    if (categories.length < 2) fail(slug, anchor, "Add at least two match options (one per line).");
    const cards: { id: string; text: string; answer: string }[] = [];
    const count = Number(fd.get("card_count") ?? 0);
    for (let i = 0; i < Math.min(count, 60); i++) {
      const text = str(fd, `card_${i}_text`, 500);
      if (!text) continue;
      const answer = str(fd, `card_${i}_answer`, 200);
      if (!categories.includes(answer)) fail(slug, anchor, `Card "${text.slice(0, 40)}" needs a match from the list of options.`);
      const id = str(fd, `card_${i}_id`, 40) || `k${randomUUID().slice(0, 8)}`;
      cards.push({ id, text, answer });
    }
    if (cards.length < 2) fail(slug, anchor, "Add at least two cards.");
    await put(m, `activity:${activityId}`, { title: str(fd, "title", 300) || a.title, categories, cards, sample });
  } else {
    const scenario = str(fd, "scenario", 5000);
    if (!scenario) fail(slug, anchor, "The scenario can't be empty.");
    const prompts = a.prompts.map((p) => ({ id: p.id, prompt: str(fd, `prompt_${p.id}`, 1000) || p.prompt }));
    await put(m, `activity:${activityId}`, { scenario, prompts, sample });
  }
  done(slug, anchor);
}

// ---------- Audio upload ----------

const AUDIO_TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac" };

export async function prepareAudioUpload(
  slug: string,
  sectionId: string,
  file: { name: string; type: string; size: number },
): Promise<{ ok: true; upload: PreparedUpload } | { ok: false; error: string }> {
  await requireAdmin();
  const m = moduleOr404(slug);
  if (!m.sections.some((s) => s.id === sectionId)) return { ok: false, error: "Unknown section." };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = AUDIO_TYPES[ext];
  if (!type) return { ok: false, error: "Please choose an audio file: .mp3, .m4a, .wav, .ogg, or .aac." };
  if (!(file.size > 0) || file.size > MAX_AUDIO_BYTES) return { ok: false, error: "Audio files must be under 50 MB. Try exporting as .mp3." };
  const safe = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "audio";
  try {
    return { ok: true, upload: await prepareUpload(`audio/${randomUUID()}-${safe}.${ext}`, type) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function finishAudioUpload(
  slug: string,
  sectionId: string,
  info: { storagePath: string; publicUrl: string; filename: string; contentType: string; size: number },
): Promise<{ ok: boolean }> {
  await requireAdmin();
  const m = moduleOr404(slug);
  const target = `section:${sectionId}`;
  const orig = originalFor(m, target) as Record<string, unknown> | undefined;
  if (!orig || !/^audio\/[\w.-]+$/.test(info.storagePath)) return { ok: false };
  await sql`insert into media_files (storage_path, public_url, filename, content_type, size_bytes)
            values (${info.storagePath}, ${info.publicUrl}, ${info.filename.slice(0, 200)}, ${info.contentType}, ${info.size})`;
  const prev = await existing(slug, target);
  await removeMediaFile(prev.audioUrl as string | undefined);
  await put(m, target, { ...orig, ...prev, audioUrl: info.publicUrl });
  return { ok: true };
}

export async function removeAudio(slug: string, sectionId: string) {
  await requireAdmin();
  const m = moduleOr404(slug);
  const target = `section:${sectionId}`;
  const orig = originalFor(m, target) as Record<string, unknown>;
  const prev = await existing(slug, target);
  await removeMediaFile(prev.audioUrl as string | undefined);
  await put(m, target, { ...orig, ...prev, audioUrl: "", audioTranscript: "" });
  done(slug, `sec-${sectionId}`, "Audio removed.");
}

/** Deletes an uploaded file we stored (never touches pasted links to other sites). */
async function removeMediaFile(url: string | undefined) {
  if (!url) return;
  const [f] = await sql<{ id: string; storage_path: string }[]>`select id, storage_path from media_files where public_url = ${url}`;
  if (!f) return;
  await deleteStored(f.storage_path);
  await sql`delete from media_files where id = ${f.id}`;
}
