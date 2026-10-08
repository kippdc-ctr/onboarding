"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { getConfig, getObservation } from "@/lib/data";
import { canEdit } from "@/lib/save";
import { nextStepId } from "@/lib/library";

export async function markSent(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("id"));
  const sent = form.get("sent") === "1";
  await sql`update observations set sent_at = ${sent ? new Date() : null}, sent_by = ${sent ? me.id : null} where id = ${id}`;
  await audit(me.id, sent ? "observation.marked_sent" : "observation.unmarked_sent", "observation", id);
  revalidatePath(`/observations/${id}`);
}

export async function deleteObservation(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("id"));
  const o = await getObservation(id);
  if (!o) redirect("/observations");
  const cfg = await getConfig();
  if (!canEdit(o, me, Number(cfg.settings.edit_window_days) || 7)) redirect(`/observations/${id}?error=` + encodeURIComponent("Only the admin can delete this observation now."));
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") redirect(`/observations/${id}?error=` + encodeURIComponent('Type DELETE to confirm.'));
  await sql`update observations set deleted_at = now() where id = ${id}`;
  await audit(me.id, "observation.deleted", "observation", id, { resident_id: o.resident_id, date: o.observed_date });
  redirect("/observations?ok=" + encodeURIComponent("Observation deleted."));
}

/** "Add to library": promote a typed step to a draft library step with an ID. */
export async function promoteCustomStep(form: FormData) {
  const me = await requireUser();
  const assignmentId = String(form.get("assignment_id"));
  const [a] = await sql<{ observation_id: string; custom_text: string | null; custom_look_fors: string; custom_practice: string; indicator: string | null; promoted_step_id: string | null }[]>`
    select observation_id, custom_text, custom_look_fors, custom_practice, indicator, promoted_step_id from observation_action_steps where id = ${assignmentId}`;
  if (!a || !a.custom_text) redirect("/observations");
  if (a.promoted_step_id) redirect(`/library/${a.promoted_step_id}`);
  const indicator = String(form.get("indicator") || a.indicator || "");
  const [ind] = await sql<{ code: string; domain: string }[]>`select code, domain from indicators where code = ${indicator}`;
  if (!ind) redirect(`/observations/${a.observation_id}?error=` + encodeURIComponent("Choose an indicator for the new library step."));
  const id = await nextStepId();
  const row = {
    id,
    domain: ind.domain,
    indicator: ind.code,
    text: String(form.get("text") || a.custom_text).trim(),
    look_fors: String(form.get("look_fors") ?? a.custom_look_fors).trim(),
    practice_rep: String(form.get("practice_rep") ?? a.custom_practice).trim(),
    status: "draft",
    source: "Typed in an observation",
  };
  await sql`insert into action_steps ${sql(row)}`;
  await sql`insert into action_step_history (step_id, changed_by, change, after) values (${id}, ${me.id}, 'created', ${sql.json(row)})`;
  await sql`update observation_action_steps set promoted_step_id = ${id} where id = ${assignmentId}`;
  await audit(me.id, "library.promoted", "action_step", id, { from_assignment: assignmentId });
  redirect(`/library/${id}?ok=` + encodeURIComponent("Added to the library as a Draft. Add look-fors and CFS links, then set it to Active."));
}
