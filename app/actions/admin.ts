"use server";

// Every action here starts with requireAdmin(): server actions are public endpoints.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getForm, getModule, moduleChecklistItems, LINK_SETTINGS, VALUE_SETTINGS } from "@/lib/content";
import { displayName, getSettings, Resident } from "@/lib/data";
import { parseCSV } from "@/lib/csv";
import { splitList, validateAnswers, FormAnswers } from "@/lib/forms";
import { requireAdmin } from "@/lib/session";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function nullable(fd: FormData, k: string): string | null {
  return str(fd, k) || null;
}
function back(path: string, msg: string, kind: "ok" | "error" = "ok"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(msg)}`);
}

function normalizeGradeBand(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("ece") || s.startsWith("early")) return "ECE";
  if (s.startsWith("elem") || s === "es") return "Elementary";
  if (s.startsWith("mid") || s === "ms") return "Middle";
  if (s.startsWith("sec") || s.startsWith("high") || s === "hs") return "Secondary";
  return null;
}

// ---------- PIN support ----------

export async function unlockResident(id: string) {
  await requireAdmin();
  await sql`update residents set locked = false, failed_pin_attempts = 0 where id = ${id}`;
  revalidatePath("/admin", "layout");
}

export async function resetPin(id: string) {
  await requireAdmin();
  // Clearing the PIN also signs the resident out on every device; they create a new PIN at next sign-in.
  await sql`update residents set pin_encrypted = null, pin_set_at = null, locked = false, failed_pin_attempts = 0 where id = ${id}`;
  revalidatePath("/admin", "layout");
}

// ---------- Verification ----------

export async function setItemVerified(residentId: string, itemId: string, verified: boolean) {
  await requireAdmin();
  await sql`
    update item_checks set verified = ${verified}, verified_by = 'admin', verified_at = ${verified ? sql`now()` : null}
    where resident_id = ${residentId} and item_id = ${itemId} and (checked or not ${verified})`;
  revalidatePath("/admin", "layout");
}

export async function setChecklistVerified(residentId: string, moduleSlug: string, itemId: string, verified: boolean) {
  await requireAdmin();
  await sql`
    update checklist_items set verified = ${verified}, verified_at = ${verified ? sql`now()` : null}
    where resident_id = ${residentId} and module_slug = ${moduleSlug} and item_id = ${itemId} and (checked or not ${verified})`;
  revalidatePath("/admin", "layout");
}

/** Admin can also tick (or untick) an item on a resident's behalf. */
export async function adminSetChecked(residentId: string, target: string, checked: boolean) {
  await requireAdmin();
  if (target.startsWith("item:")) {
    const itemId = target.slice(5);
    await sql`
      insert into item_checks (resident_id, item_id, checked, checked_at)
      values (${residentId}, ${itemId}, ${checked}, ${checked ? sql`now()` : null})
      on conflict (resident_id, item_id) do update set checked = excluded.checked, checked_at = excluded.checked_at,
        verified = case when excluded.checked then item_checks.verified else false end`;
  } else if (target.startsWith("chk:")) {
    const [moduleSlug, itemId] = target.slice(4).split("/");
    const m = getModule(moduleSlug);
    if (!m || !moduleChecklistItems(m).some((i) => i.id === itemId)) return;
    await sql`
      insert into checklist_items (resident_id, module_slug, item_id, checked, checked_at)
      values (${residentId}, ${moduleSlug}, ${itemId}, ${checked}, ${checked ? sql`now()` : null})
      on conflict (resident_id, module_slug, item_id) do update set checked = excluded.checked, checked_at = excluded.checked_at,
        verified = case when excluded.checked then checklist_items.verified else false end`;
  }
  revalidatePath("/admin", "layout");
}

// ---------- Roster ----------

type NewResident = {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_band: string | null;
  group_number: number | null;
  school: string | null;
  email: string | null;
  picker_label: string | null;
};

async function cohortYear(): Promise<number> {
  const [row] = await sql<{ y: number | null }[]>`select max(cohort_year) as y from residents where not is_sample`;
  return row?.y ?? 2028;
}

/**
 * Duplicate-name guard: if an active resident already shows with the same name in the picker,
 * the new one needs a label, and the existing one gets one too (school, or a number).
 */
async function duplicateCheck(r: NewResident, excludeId?: string): Promise<{ error?: string; labelExisting?: { id: string; label: string }[] }> {
  const shown = displayName(r).toLowerCase();
  const rows = await sql<Resident[]>`select * from residents where active and id <> ${excludeId ?? "00000000-0000-0000-0000-000000000000"}`;
  const dupes = rows.filter((x) => displayName(x).toLowerCase() === shown);
  if (!dupes.length) return {};
  if (!r.picker_label) {
    return { error: `${displayName(r)} is already on the roster. Add a distinguishing label (for example the school or last initial) so the name picker can show both.` };
  }
  if (dupes.some((d) => (d.picker_label ?? "").toLowerCase() === r.picker_label!.toLowerCase())) {
    return { error: `Another ${displayName(r)} already uses the label "${r.picker_label}". Choose a different label.` };
  }
  const labelExisting = dupes.filter((d) => !d.picker_label).map((d, i) => ({ id: d.id, label: d.school || `#${i + 1}` }));
  return { labelExisting };
}

function readResident(fd: FormData): NewResident | string {
  const first_name = str(fd, "first_name");
  const last_name = str(fd, "last_name");
  if (!first_name || !last_name) return "First and last name are required (they must match the offer letter).";
  const gb = str(fd, "grade_band");
  const grade_band = gb ? normalizeGradeBand(gb) : null;
  if (gb && !grade_band) return `Unknown grade band "${gb}". Use ECE, Elementary, Middle, or Secondary.`;
  const g = str(fd, "group_number");
  const group_number = g ? Number(g) : null;
  if (group_number !== null && !(Number.isInteger(group_number) && group_number >= 1 && group_number <= 8)) return "Group must be 1 to 8.";
  return {
    first_name,
    last_name,
    preferred_name: nullable(fd, "preferred_name"),
    grade_band,
    group_number,
    school: nullable(fd, "school"),
    email: nullable(fd, "email"),
    picker_label: nullable(fd, "picker_label"),
  };
}

export async function addResident(fd: FormData) {
  await requireAdmin();
  const r = readResident(fd);
  if (typeof r === "string") back("/admin/roster", r, "error");
  const dup = await duplicateCheck(r);
  if (dup.error) back("/admin/roster", dup.error, "error");
  for (const l of dup.labelExisting ?? []) await sql`update residents set picker_label = ${l.label} where id = ${l.id}`;
  await sql`insert into residents ${sql({ ...r, cohort_year: await cohortYear() })}`;
  revalidatePath("/admin", "layout");
  back("/admin/roster", `Added ${displayName(r)}.`);
}

export async function bulkAddResidents(fd: FormData) {
  await requireAdmin();
  const text = str(fd, "bulk");
  const defaultGroup = str(fd, "default_group");
  const rows = parseCSV(text);
  if (!rows.length) back("/admin/roster", "Paste at least one line: First, Last, Grade band", "error");
  // Skip a header row if present.
  if (/first/i.test(rows[0][0] ?? "") && /last/i.test(rows[0][1] ?? "")) rows.shift();
  const year = await cohortYear();
  const added: string[] = [];
  const problems: string[] = [];
  for (const [i, cols] of rows.entries()) {
    const [first, last, gb, group, school, preferred, email] = cols;
    const f = new FormData();
    f.set("first_name", first ?? "");
    f.set("last_name", last ?? "");
    f.set("grade_band", gb ?? "");
    f.set("group_number", group || defaultGroup);
    f.set("school", school ?? "");
    f.set("preferred_name", preferred ?? "");
    f.set("email", email ?? "");
    const r = readResident(f);
    if (typeof r === "string") {
      problems.push(`Line ${i + 1}: ${r}`);
      continue;
    }
    let dup = await duplicateCheck(r);
    if (dup.error && !r.picker_label) {
      r.picker_label = r.school || `${r.last_name.slice(0, 1)}. #2`;
      dup = await duplicateCheck(r);
    }
    if (dup.error) {
      problems.push(`Line ${i + 1}: ${dup.error}`);
      continue;
    }
    for (const l of dup.labelExisting ?? []) await sql`update residents set picker_label = ${l.label} where id = ${l.id}`;
    await sql`insert into residents ${sql({ ...r, cohort_year: year })}`;
    added.push(displayName(r) + (r.picker_label ? ` (${r.picker_label})` : ""));
  }
  revalidatePath("/admin", "layout");
  const msg = `Added ${added.length} resident${added.length === 1 ? "" : "s"}.` + (problems.length ? ` Skipped ${problems.length}: ${problems.join(" | ")}` : "");
  back("/admin/roster", msg, problems.length && !added.length ? "error" : "ok");
}

export async function updateResident(id: string, fd: FormData) {
  await requireAdmin();
  const r = readResident(fd);
  const path = `/admin/residents/${id}`;
  if (typeof r === "string") back(path, r, "error");
  const dup = await duplicateCheck(r, id);
  if (dup.error) back(path, dup.error, "error");
  for (const l of dup.labelExisting ?? []) await sql`update residents set picker_label = ${l.label} where id = ${l.id}`;
  await sql`update residents set ${sql(r)} where id = ${id}`;
  revalidatePath("/admin", "layout");
  back(path, "Saved.");
}

export async function setResidentActive(id: string, active: boolean) {
  await requireAdmin();
  await sql`update residents set active = ${active} where id = ${id}`;
  revalidatePath("/admin", "layout");
}

// ---------- Groups and due dates ----------

export async function saveGroups(fd: FormData) {
  await requireAdmin();
  for (let n = 1; n <= 8; n++) {
    const v = str(fd, `group_${n}`);
    if (!fd.has(`group_${n}`)) continue;
    if (v && !ISO_DATE.test(v)) back("/admin/groups", `Group ${n}: invalid date.`, "error");
    await sql`insert into groups (number, welcome_email_date) values (${n}, ${v || null})
      on conflict (number) do update set welcome_email_date = excluded.welcome_email_date`;
  }
  // Per-group overrides: fields named ov__<group>__<target>
  for (const [k, raw] of fd.entries()) {
    if (!k.startsWith("ov__")) continue;
    const [, g, target] = k.split("__");
    const v = String(raw).trim();
    const group = Number(g);
    if (!Number.isInteger(group)) continue;
    if (!v) await sql`delete from group_due_overrides where group_number = ${group} and target = ${target}`;
    else if (ISO_DATE.test(v))
      await sql`insert into group_due_overrides (group_number, target, due_date) values (${group}, ${target}, ${v})
        on conflict (group_number, target) do update set due_date = excluded.due_date`;
  }
  revalidatePath("/", "layout");
  back("/admin/groups", "Groups saved.");
}

// ---------- Settings ----------

export async function saveSettings(fd: FormData) {
  await requireAdmin();
  const allowed = new Set([...LINK_SETTINGS, ...VALUE_SETTINGS].map((s) => s.key));
  for (const [k, raw] of fd.entries()) {
    if (k.startsWith("set__")) {
      const key = k.slice(5);
      if (!allowed.has(key)) continue;
      let v = String(raw).trim();
      if (LINK_SETTINGS.some((s) => s.key === key) && v && !/^https?:\/\//i.test(v)) v = "https://" + v;
      await sql`insert into settings (key, value) values (${key}, ${v}) on conflict (key) do update set value = excluded.value`;
    } else if (k.startsWith("mod_due__")) {
      const slug = k.slice(9);
      const v = String(raw).trim();
      if (v && !ISO_DATE.test(v)) continue;
      await sql`update modules set due_date = ${v || null} where slug = ${slug}`;
    } else if (k.startsWith("mod_soft__")) {
      const slug = k.slice(10);
      const v = String(raw).trim(); // datetime-local, interpreted in the app time zone
      await sql`update modules set soft_due_date = ${v ? sql`(${v}::timestamp at time zone ${process.env.APP_TIME_ZONE || "America/New_York"})` : null} where slug = ${slug}`;
    } else if (k.startsWith("item_due__")) {
      const id = k.slice(10);
      const v = String(raw).trim();
      if (v && !ISO_DATE.test(v)) continue;
      await sql`update phase_items set due_date = ${v || null} where id = ${id} and due_rule = 'fixed'`;
    } else if (k.startsWith("item_days__")) {
      const id = k.slice(11);
      const n = Number(String(raw).trim());
      if (Number.isInteger(n) && n >= 0 && n <= 365) await sql`update phase_items set due_days = ${n} where id = ${id} and due_rule = 'group_plus_days'`;
    }
  }
  revalidatePath("/", "layout");
  back(String(fd.get("_return") || "/admin/settings"), "Settings saved.");
}

// ---------- Praxis import ----------

export type PraxisPreviewRow = {
  line: number;
  name: string;
  residentId: string | null;
  matchedName: string | null;
  stage: number | null;
  math: string;
  reading: string;
  writing: string;
  problem: string | null;
};

export async function previewPraxis(csv: string): Promise<{ rows: PraxisPreviewRow[]; error?: string }> {
  await requireAdmin();
  const rows = parseCSV(csv);
  if (!rows.length) return { rows: [], error: "The file is empty." };
  const header = rows[0].map((h) => h.toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  let iFirst = col(/^first/), iLast = col(/^last/), iName = col(/^(resident|name|full)/);
  const iStage = col(/stage/), iMath = col(/math/), iRead = col(/read/), iWrite = col(/writ/);
  const hasHeader = iStage >= 0 || iMath >= 0;
  if (!hasHeader) {
    // No header: assume Resident name, Stage, Math, Reading, Writing
    iName = 0;
    iFirst = iLast = -1;
  }
  const data = hasHeader ? rows.slice(1) : rows;
  const settings = await getSettings();
  const allowed = splitList(settings["praxis.status_options"]);
  const residents = await sql<Resident[]>`select * from residents`;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const out: PraxisPreviewRow[] = data.map((cols, idx) => {
    let first = "", last = "";
    if (iFirst >= 0 && iLast >= 0) {
      first = cols[iFirst] ?? "";
      last = cols[iLast] ?? "";
    } else {
      const full = (cols[iName >= 0 ? iName : 0] ?? "").trim();
      if (full.includes(",")) [last, first] = full.split(",").map((s) => s.trim());
      else {
        const parts = full.split(/\s+/);
        last = parts.pop() ?? "";
        first = parts.join(" ");
      }
    }
    const matches = residents.filter(
      (r) => norm(r.last_name) === norm(last) && (norm(r.first_name) === norm(first) || norm(r.preferred_name ?? "") === norm(first)),
    );
    const canon = (v: string | undefined) => {
      const s = (v ?? "").trim();
      if (!s) return "";
      return allowed.find((a) => a.toLowerCase() === s.toLowerCase()) ?? s;
    };
    const stageRaw = (cols[iStage] ?? "").replace(/[^0-9]/g, "");
    const stage = stageRaw ? Number(stageRaw) : null;
    const math = canon(cols[iMath]), reading = canon(cols[iRead]), writing = canon(cols[iWrite]);
    let problem: string | null = null;
    if (matches.length === 0) problem = "No matching resident";
    else if (matches.length > 1) problem = "More than one resident has this name";
    else if (stage !== null && (stage < 1 || stage > 6)) problem = "Stage must be 1 to 6";
    else {
      const bad = [math, reading, writing].filter((v) => v && !allowed.includes(v));
      if (bad.length) problem = `Unknown status: ${bad.join(", ")}`;
    }
    return {
      line: idx + (hasHeader ? 2 : 1),
      name: `${first} ${last}`.trim(),
      residentId: matches.length === 1 ? matches[0].id : null,
      matchedName: matches.length === 1 ? displayName(matches[0]) : null,
      stage,
      math,
      reading,
      writing,
      problem,
    };
  });
  return { rows: out };
}

export async function commitPraxis(csv: string): Promise<{ saved: number; skipped: number }> {
  await requireAdmin();
  const { rows } = await previewPraxis(csv);
  let saved = 0;
  for (const r of rows) {
    if (r.problem || !r.residentId) continue;
    await sql`
      insert into praxis_status (resident_id, stage, math, reading, writing, updated_at)
      values (${r.residentId}, ${r.stage}, ${r.math || null}, ${r.reading || null}, ${r.writing || null}, now())
      on conflict (resident_id) do update set stage = excluded.stage, math = excluded.math, reading = excluded.reading,
        writing = excluded.writing, updated_at = now()`;
    const exempt = [r.math, r.reading, r.writing].every((v) => v.toLowerCase() === "exempt");
    await sql`update residents set praxis_exempt = ${exempt} where id = ${r.residentId}`;
    saved++;
  }
  revalidatePath("/", "layout");
  return { saved, skipped: rows.length - saved };
}

// ---------- In-app form responses ----------

export async function adminSaveForm(residentId: string, formSlug: string, answers: FormAnswers): Promise<{ ok: boolean; errors: Record<string, string> }> {
  await requireAdmin();
  const form = getForm(formSlug);
  if (!form) return { ok: false, errors: { _: "Unknown form" } };
  const { clean } = validateAnswers(form, answers, await getSettings());
  await sql`
    insert into form_responses (resident_id, form_slug, answers_json, status, updated_at)
    values (${residentId}, ${formSlug}, ${sql.json(clean as never)}, 'draft', now())
    on conflict (resident_id, form_slug) do update set answers_json = excluded.answers_json, updated_at = now()`;
  revalidatePath("/admin", "layout");
  return { ok: true, errors: {} };
}

export async function reopenForm(residentId: string, formSlug: string) {
  await requireAdmin();
  await sql`update form_responses set status = 'draft', reopened_by = 'admin', updated_at = now()
            where resident_id = ${residentId} and form_slug = ${formSlug}`;
  revalidatePath("/", "layout");
}

// ---------- Data retention ----------

export async function deleteSampleData() {
  await requireAdmin();
  const res = await sql`delete from residents where is_sample`;
  revalidatePath("/", "layout");
  back("/admin/data", `Deleted ${res.count} sample resident${res.count === 1 ? "" : "s"} and all their data.`);
}

export async function deleteCohort(fd: FormData) {
  await requireAdmin();
  const year = Number(str(fd, "cohort_year"));
  const confirm = str(fd, "confirm");
  if (!Number.isInteger(year)) back("/admin/data", "Choose a cohort year.", "error");
  if (confirm !== `DELETE ${year}`) back("/admin/data", `Type DELETE ${year} exactly to confirm.`, "error");
  const res = await sql`delete from residents where cohort_year = ${year}`;
  revalidatePath("/", "layout");
  back("/admin/data", `Deleted cohort ${year}: ${res.count} residents and all their responses.`);
}
