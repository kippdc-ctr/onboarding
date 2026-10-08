"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { getConfig, getResident, rulesForOne } from "@/lib/data";
import { standingAt } from "@/lib/rules";

const back = (id: string, msg: string, err = false) => redirect(`/residents/${id}?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function changeTrack(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("resident_id"));
  const r = await getResident(id);
  if (!r) redirect("/residents");
  const cfg = await getConfig();
  const track = String(form.get("track"));
  const def = cfg.tracks.find((t) => t.code === track);
  if (!def) back(id, "Choose a track.", true);
  const tierRaw = String(form.get("tier") ?? "");
  const tier = def!.follows_calendar ? null : Number(tierRaw);
  if (!def!.follows_calendar && !cfg.tiers.some((t) => t.number === tier)) back(id, "Choose the tier for this track.", true);
  const from = String(form.get("effective_from"));
  if (!isDate(from)) back(id, "Enter the date the change takes effect.", true);
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) back(id, "Add a short reason so the history makes sense later.", true);
  const decidedBy = String(form.get("decided_by") || me.id);
  const before = standingAt(from, cfg, await rulesForOne(id));
  await sql`insert into resident_track (resident_id, track, tier, effective_from, reason, decided_by, set_by, previous_track, previous_tier)
            values (${id}, ${track}, ${tier}, ${from}, ${reason}, ${decidedBy}, ${me.id}, ${before.track}, ${before.tier})`;
  await audit(me.id, "resident.track_changed", "resident", id, { track, tier, effective_from: from, reason, decided_by: decidedBy, previous: before });
  back(id, `Track set to ${def!.name}${tier ? `, Tier ${tier}` : ""} from ${from}.`);
}

export async function setIndicatorOverride(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("resident_id"));
  const indicator = String(form.get("indicator"));
  const mode = String(form.get("mode"));
  if (mode === "clear") {
    await sql`delete from resident_indicator_override where resident_id = ${id} and indicator = ${indicator}`;
    await audit(me.id, "resident.override_cleared", "resident", id, { indicator });
    back(id, `${indicator} follows the track again.`);
  }
  if (mode !== "on" && mode !== "off") back(id, "Choose on or off.", true);
  const from = String(form.get("effective_from"));
  if (!isDate(from)) back(id, "Enter the date the override starts.", true);
  const reason = String(form.get("reason") ?? "").trim();
  await sql`insert into resident_indicator_override (resident_id, indicator, mode, effective_from, reason, set_by)
            values (${id}, ${indicator}, ${mode}, ${from}, ${reason}, ${me.id})
            on conflict (resident_id, indicator) do update set mode = excluded.mode, effective_from = excluded.effective_from, reason = excluded.reason, set_by = excluded.set_by, created_at = now()`;
  await audit(me.id, "resident.override_set", "resident", id, { indicator, mode, effective_from: from, reason });
  back(id, `${indicator} turned ${mode} from ${from}.`);
}

export async function setCycleOverride(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("resident_id"));
  const cycle = Number(form.get("cycle"));
  if (form.get("clear")) {
    await sql`delete from resident_cycle_override where resident_id = ${id} and cycle = ${cycle}`;
    await audit(me.id, "resident.cycle_override_cleared", "resident", id, { cycle });
    back(id, `Cycle ${cycle} uses the program dates again.`);
  }
  const start = String(form.get("start_date"));
  const end = String(form.get("end_date"));
  if (!isDate(start) || !isDate(end) || end < start) back(id, "Enter a start and end date (end after start).", true);
  await sql`insert into resident_cycle_override (resident_id, cycle, start_date, end_date) values (${id}, ${cycle}, ${start}, ${end})
            on conflict (resident_id, cycle) do update set start_date = excluded.start_date, end_date = excluded.end_date`;
  await audit(me.id, "resident.cycle_override_set", "resident", id, { cycle, start, end });
  back(id, `Custom dates saved for Cycle ${cycle}.`);
}

export async function addPriority(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("resident_id"));
  const note = String(form.get("note") ?? "").trim();
  if (!note) back(id, "Write the priority.", true);
  const indicator = String(form.get("indicator") || "") || null;
  await sql`insert into resident_priorities (resident_id, cycle, indicator, note, created_by) values (${id}, ${Number(form.get("cycle"))}, ${indicator}, ${note}, ${me.id})`;
  await audit(me.id, "resident.priority_added", "resident", id, { note, indicator });
  revalidatePath(`/residents/${id}`);
}

export async function closePriority(form: FormData) {
  const me = await requireUser();
  const pid = Number(form.get("priority_id"));
  const [p] = await sql<{ resident_id: string }[]>`update resident_priorities set closed = not closed where id = ${pid} returning resident_id`;
  if (p) {
    await audit(me.id, "resident.priority_toggled", "resident", p.resident_id, { priority_id: pid });
    revalidatePath(`/residents/${p.resident_id}`);
  }
}

const FIELDS = ["full_name", "preferred_first", "last_name", "pronouns", "status", "advisor_code", "school", "campus", "grade_band", "content", "grade", "mentor_teacher", "mentor_email", "manager", "email"] as const;

export async function saveResident(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("resident_id") ?? "");
  const row: Record<string, string | boolean> = {};
  for (const f of FIELDS) row[f] = String(form.get(f) ?? "").trim();
  row.active = form.get("active") === "on";
  if (!row.full_name) redirect(`/residents/${id || "new"}?error=` + encodeURIComponent("Enter the resident's full name."));
  if (id) {
    await sql`update residents set ${sql(row)}, updated_at = now() where id = ${id}`;
    await audit(me.id, "resident.edited", "resident", id, row);
    back(id, "Resident saved.");
  }
  const personId = String(form.get("person_id") ?? "").trim() || `P-${Date.now().toString(36).toUpperCase()}`;
  const [ins] = await sql<{ id: string }[]>`insert into residents ${sql({ ...row, person_id: personId })} returning id`;
  await audit(me.id, "resident.added", "resident", ins.id, row);
  back(ins.id, "Resident added.");
}
