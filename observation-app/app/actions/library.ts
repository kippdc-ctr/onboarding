"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { getConfig, getStep, type ActionStep } from "@/lib/data";
import { nextStepId } from "@/lib/library";
import { parseCSV } from "@/lib/csv";

const list = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const go = (id: string, msg: string, err = false) => redirect(`/library/${id}?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);

async function stepFromForm(form: FormData) {
  const cfg = await getConfig();
  const indicator = String(form.get("indicator") ?? "");
  const ind = cfg.indicators.find((i) => i.code === indicator);
  const cfsIds = form.getAll("cfs_ids").map(String).filter((c) => cfg.cfs.some((x) => x.id === c && x.indicator === indicator));
  const crossCutting = form.get("cross_cutting") === "on";
  const status = String(form.get("status") ?? "active");
  return {
    ind,
    row: {
      indicator,
      domain: ind?.domain ?? "",
      cfs_ids: crossCutting ? [] : cfsIds,
      link_type: crossCutting ? "cross_cutting" : cfsIds.length > 1 ? "multiple" : "single",
      text: String(form.get("text") ?? "").trim(),
      skill_level: String(form.get("skill_level") ?? "").trim(),
      grade_band: String(form.get("grade_band") ?? "").trim(),
      content_area: String(form.get("content_area") ?? "").trim(),
      look_fors: String(form.get("look_fors") ?? "").trim(),
      practice_rep: String(form.get("practice_rep") ?? "").trim(),
      resource_url: String(form.get("resource_url") ?? "").trim(),
      tags: list(String(form.get("tags") ?? "")),
      status: ["active", "draft", "retired"].includes(status) ? status : "active",
      intro_cycle: form.get("intro_cycle") === "" || form.get("intro_cycle") === null ? null : Number(form.get("intro_cycle")),
    },
  };
}

export async function saveStep(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { ind, row } = await stepFromForm(form);
  if (!ind) go(id || "new", "Choose an indicator.", true);
  if (!row.text) go(id || "new", "Enter the step text.", true);
  if (row.resource_url && !/^https?:\/\//i.test(row.resource_url)) go(id || "new", "The resource link must start with http:// or https://", true);
  if (id) {
    const before = await getStep(id);
    if (!before) redirect("/library");
    if (before.is_legacy && row.status !== "retired") go(id, "Legacy steps stay retired so they never appear in the picker. Add a new step instead.", true);
    const retiredAt = row.status === "retired" ? before.retired_at ?? new Date().toISOString().slice(0, 10) : null;
    await sql`update action_steps set ${sql({ ...row, retired_at: retiredAt })}, updated_at = now() where id = ${id}`;
    await sql`insert into action_step_history (step_id, changed_by, change, before, after) values (${id}, ${me.id}, 'edited', ${sql.json(before as never)}, ${sql.json(row as never)})`;
    await audit(me.id, "library.edited", "action_step", id);
    go(id, "Saved. Observations already sent keep the wording they were sent with.");
  }
  const newId = await nextStepId();
  await sql`insert into action_steps ${sql({ ...row, id: newId, source: "Added in the app" })}`;
  await sql`insert into action_step_history (step_id, changed_by, change, after) values (${newId}, ${me.id}, 'created', ${sql.json(row as never)})`;
  await audit(me.id, "library.created", "action_step", newId);
  go(newId, "Step added.");
}

export async function mergeStep(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get("id"));
  const into = String(form.get("into") ?? "").trim().toUpperCase();
  if (!into || into === id) go(id, "Enter the ID of the step to keep.", true);
  const target = await getStep(into);
  if (!target || target.status === "retired") go(id, `${into} isn't an active step.`, true);
  await sql`update action_steps set status = 'retired', retired_at = coalesce(retired_at, current_date), merged_into = ${into}, replacement_id = ${into}, updated_at = now() where id = ${id}`;
  await sql`insert into action_step_history (step_id, changed_by, change, after) values (${id}, ${me.id}, 'merged', ${sql.json({ merged_into: into })})`;
  await audit(me.id, "library.merged", "action_step", id, { into });
  go(id, `Merged into ${into}. Past observations still show this step's wording; analytics list it with ${into}'s replacement link.`);
}

const COLS = ["id", "indicator", "text", "cfs_ids", "link_type", "look_fors", "practice_rep", "resource_url", "tags", "skill_level", "grade_band", "content_area", "status"] as const;

export type ImportResult = { added: number; updated: number; errors: string[] };

export async function importSteps(_: ImportResult | null, form: FormData): Promise<ImportResult> {
  const me = await requireAdmin();
  const cfg = await getConfig();
  const file = form.get("file");
  const text = file instanceof File && file.size ? await file.text() : String(form.get("paste") ?? "");
  const rows = parseCSV(text);
  if (rows.length < 2) return { added: 0, updated: 0, errors: ["Paste or upload a CSV with a header row."] };
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z_]/g, "_").replace(/_+$/, ""));
  const idx = (c: string) => header.indexOf(c);
  if (idx("text") < 0 || idx("indicator") < 0) return { added: 0, updated: 0, errors: [`The header needs at least "indicator" and "text". Allowed columns: ${COLS.join(", ")}.`] };
  const out: ImportResult = { added: 0, updated: 0, errors: [] };
  for (const [n, r] of rows.slice(1).entries()) {
    const get = (c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? "").trim() : "");
    const ind = cfg.indicators.find((i) => i.code === get("indicator"));
    if (!ind) { out.errors.push(`Row ${n + 2}: unknown indicator "${get("indicator")}".`); continue; }
    const cfsIds = list(get("cfs_ids")).filter((c) => cfg.cfs.some((x) => x.id === c));
    const patch: Partial<ActionStep> = { indicator: ind.code, domain: ind.domain };
    if (get("text")) patch.text = get("text");
    for (const c of ["look_fors", "practice_rep", "resource_url", "skill_level", "grade_band", "content_area"] as const) if (get(c)) patch[c] = get(c);
    if (get("tags")) patch.tags = list(get("tags"));
    if (get("cfs_ids")) { patch.cfs_ids = cfsIds; patch.link_type = cfsIds.length > 1 ? "multiple" : "single"; }
    if (["single", "multiple", "cross_cutting"].includes(get("link_type"))) patch.link_type = get("link_type") as ActionStep["link_type"];
    if (["active", "draft", "retired"].includes(get("status").toLowerCase())) patch.status = get("status").toLowerCase() as ActionStep["status"];
    const id = get("id");
    const existing = id ? await getStep(id) : null;
    if (existing) {
      if (existing.is_legacy) patch.status = "retired";
      await sql`update action_steps set ${sql(patch as never)}, updated_at = now() where id = ${id}`;
      await sql`insert into action_step_history (step_id, changed_by, change, before, after) values (${id}, ${me.id}, 'edited', ${sql.json(existing as never)}, ${sql.json(patch as never)})`;
      out.updated++;
    } else {
      if (!patch.text) { out.errors.push(`Row ${n + 2}: no text.`); continue; }
      const newId = await nextStepId();
      await sql`insert into action_steps ${sql({ ...patch, id: newId, source: "Bulk import" } as never)}`;
      await sql`insert into action_step_history (step_id, changed_by, change, after) values (${newId}, ${me.id}, 'created', ${sql.json(patch as never)})`;
      out.added++;
    }
  }
  await audit(me.id, "library.imported", "action_step", "", out);
  return out;
}
