"use server";

// Owner-only actions. Every action re-checks the signed-in user: server actions are public endpoints.
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { allowedDomain, requireUser, Role } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";
import { audit } from "@/lib/audit";
import { CATEGORIES, getCampuses, getGoal, getGoals, getPeriods, getSources, getYear, listYears, scoreGoals } from "@/lib/data";
import { deleteSampleData, loadSampleData } from "@/lib/samples";
import { back, errMsg, ISO_DATE, str } from "./util";

const owner = () => requireUser("owner");

// ---------- Goals ----------

const GOAL_TEXT_FIELDS = ["text", "category", "numerator_def", "denominator_def", "measured_label", "owner"] as const;
const GOAL_NULLABLE_TEXT = ["target_count_note", "baseline_n", "baseline_note"] as const;

export async function saveGoal(fd: FormData) {
  const u = await owner();
  const goal = await getGoal(Number(str(fd, "id")));
  if (!goal) back("/admin/goals", "Goal not found.", "error");
  const path = `/admin/goals/${goal.id}`;
  const next: Record<string, unknown> = {};
  for (const k of GOAL_TEXT_FIELDS) next[k] = str(fd, k);
  for (const k of GOAL_NULLABLE_TEXT) next[k] = str(fd, k) || null;
  next.type = str(fd, "type");
  next.population = str(fd, "population");
  next.unit = str(fd, "unit");
  next.direction = str(fd, "direction");
  next.source = str(fd, "source");
  next.measured_at = str(fd, "measured_at") || null;
  next.pace_by = str(fd, "pace_by") || null;
  next.target_value = Number(str(fd, "target_value"));
  next.baseline_value = str(fd, "baseline_value") === "" ? null : Number(str(fd, "baseline_value"));
  for (const k of ["target_confirmed", "suppress_small_n", "counts_withdrawn", "active"]) next[k] = fd.get(k) === "on";

  if (!next.text) back(path, "Goal text is required.", "error");
  if (!CATEGORIES.includes(next.category as string)) back(path, "Choose a category.", "error");
  if (!["achievement", "perception", "input"].includes(next.type as string)) back(path, "Choose a type.", "error");
  if (!["percent", "count"].includes(next.unit as string) || !["at_least", "at_most"].includes(next.direction as string)) back(path, "Choose a unit and direction.", "error");
  if (!Number.isFinite(next.target_value) || (next.target_value as number) < 0) back(path, "Target must be a number.", "error");
  if (next.baseline_value !== null && !Number.isFinite(next.baseline_value)) back(path, "SY25-26 actual must be a number or blank.", "error");
  if (!(await getSources()).some((s) => s.key === next.source)) back(path, "Choose a source.", "error");
  if (next.measured_at && !(await getPeriods(goal.school_year)).some((p) => p.key === next.measured_at)) back(path, "Choose a period.", "error");
  if (!next.measured_label) next.measured_label = (next.measured_at as string) ?? "Each cycle";

  const changes = Object.entries(next).filter(([k, v]) => String(goal[k as keyof typeof goal] ?? "") !== String(v ?? ""));
  if (!changes.length) back(path, "No changes.");
  const note = str(fd, "change_note") || null;
  await sql.begin(async (tx) => {
    await tx`update metrics.goals set ${tx(next as Record<string, string>)} where id = ${goal.id}`;
    for (const [k, v] of changes) {
      await tx`insert into metrics.goal_changes (goal_id, changed_by, field, old_value, new_value, note)
               values (${goal.id}, ${u.email}, ${k}, ${String(goal[k as keyof typeof goal] ?? "")}, ${String(v ?? "")}, ${note})`;
    }
  });
  await audit(u, "goal_edit", `goal ${goal.number}`, { fields: changes.map(([k]) => k) });
  revalidatePath("/", "layout");
  back(path, `Saved ${changes.length} change${changes.length === 1 ? "" : "s"}.`);
}

export async function confirmAllTargets() {
  const u = await owner();
  const year = await getYear();
  const rows = await sql<{ id: number }[]>`update metrics.goals set target_confirmed = true where school_year = ${year.id} and not target_confirmed returning id`;
  for (const r of rows) await sql`insert into metrics.goal_changes (goal_id, changed_by, field, old_value, new_value) values (${r.id}, ${u.email}, 'target_confirmed', 'false', 'true')`;
  await audit(u, "goal_edit", "all goals", { confirmed_targets: rows.length });
  revalidatePath("/", "layout");
  back("/admin/goals", `Marked ${rows.length} target${rows.length === 1 ? "" : "s"} as confirmed.`);
}

export async function addGoal(fd: FormData) {
  const u = await owner();
  const year = await getYear();
  const category = str(fd, "category");
  const text = str(fd, "text");
  if (!text || !CATEGORIES.slice(1).includes(category)) back("/admin/goals", "Enter goal text and a category.", "error");
  const [{ next }] = await sql<{ next: number }[]>`select coalesce(max(number), 0) + 1 as next from metrics.goals where school_year = ${year.id}`;
  const [g] = await sql<{ id: number }[]>`
    insert into metrics.goals (school_year, number, category, text, type, population, target_value, source, measured_at, measured_label)
    values (${year.id}, ${next}, ${category}, ${text}, 'achievement', 'first_year', 0, 'manual', 'EOY', 'EOY')
    returning id`;
  await sql`insert into metrics.goal_changes (goal_id, changed_by, field, new_value) values (${g.id}, ${u.email}, 'created', ${text})`;
  await audit(u, "goal_edit", `goal ${next}`, { created: true });
  back(`/admin/goals/${g.id}`, `Added goal ${next}. Set its target and definition below.`);
}

// ---------- Users ----------

function validRole(r: string): r is Role {
  return r === "owner" || r === "team" || r === "rdl";
}

export async function addUser(fd: FormData) {
  const u = await owner();
  const email = str(fd, "email").toLowerCase();
  const role = str(fd, "role");
  const campus = str(fd, "campus") || null;
  const temp = String(fd.get("temp_password") ?? "");
  const domain = allowedDomain();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back("/admin/users", "Enter an email address.", "error");
  if (domain && !email.endsWith(`@${domain}`)) back("/admin/users", `Enter an @${domain} email address.`, "error");
  if (!validRole(role)) back("/admin/users", "Choose a role.", "error");
  if (role === "rdl" && !(campus && (await getCampuses()).includes(campus))) back("/admin/users", "RDLs need a campus.", "error");
  const problem = passwordProblem(temp);
  if (problem) back("/admin/users", `Temporary password: ${problem}`, "error");
  const rows = await sql`
    insert into metrics.app_users (email, name, role, campus, password_hash, must_change_password)
    values (${email}, ${str(fd, "name") || null}, ${role}, ${role === "rdl" ? campus : null}, ${await hashPassword(temp)}, true)
    on conflict (email) do nothing returning id`;
  if (!rows.length) back("/admin/users", `${email} is already on the list.`, "error");
  await audit(u, "user_change", email, { added: true, role, campus });
  back("/admin/users", `Added ${email}. Give them the temporary password in person or by phone; they'll choose their own when they first sign in.`);
}

/** Sets a temporary password, unlocks the account, and signs the person out everywhere. */
export async function resetPassword(fd: FormData) {
  const u = await owner();
  const id = str(fd, "id");
  const temp = String(fd.get("temp_password") ?? "");
  const problem = passwordProblem(temp);
  if (problem) back("/admin/users", `Temporary password: ${problem}`, "error");
  const [target] = await sql<{ email: string }[]>`
    update metrics.app_users set password_hash = ${await hashPassword(temp)}, must_change_password = true,
      failed_attempts = 0, locked_until = null, version = version + 1
    where id = ${id} returning email`;
  if (!target) back("/admin/users", "User not found.", "error");
  await audit(u, "user_change", target.email, { password_reset: true });
  back("/admin/users", `Reset ${target.email}'s password. They'll choose a new one at their next sign-in.`);
}

export async function updateUser(fd: FormData) {
  const u = await owner();
  const id = str(fd, "id");
  const role = str(fd, "role");
  const campus = str(fd, "campus") || null;
  const active = fd.get("active") === "on";
  if (!validRole(role)) back("/admin/users", "Choose a role.", "error");
  if (role === "rdl" && !(campus && (await getCampuses()).includes(campus))) back("/admin/users", "RDLs need a campus.", "error");
  const [target] = await sql<{ email: string; role: Role; active: boolean }[]>`select email, role, active from metrics.app_users where id = ${id}`;
  if (!target) back("/admin/users", "User not found.", "error");
  if (target.role === "owner" && (role !== "owner" || !active)) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from metrics.app_users where role = 'owner' and active and id <> ${id}`;
    if (!n) back("/admin/users", "There must always be at least one active owner.", "error");
  }
  // Bumping the version signs the person out everywhere so the new role applies immediately.
  await sql`update metrics.app_users set role = ${role}, campus = ${role === "rdl" ? campus : null}, active = ${active}, name = ${str(fd, "name") || null}, version = version + 1 where id = ${id}`;
  await audit(u, "user_change", target.email, { role, campus, active });
  back("/admin/users", `Updated ${target.email}.`);
}

// ---------- Calendar ----------

export async function savePeriods(fd: FormData) {
  const u = await owner();
  const year = await getYear(str(fd, "year"));
  const periods = await getPeriods(year.id);
  let changed = 0;
  for (const p of periods) {
    const opens = str(fd, `opens:${p.key}`);
    const closes = str(fd, `closes:${p.key}`);
    const confirmed = fd.get(`confirmed:${p.key}`) === "on";
    if (!ISO_DATE.test(opens) || !ISO_DATE.test(closes) || closes < opens) back("/admin/calendar", `${p.key}: enter valid dates (closes on or after opens).`, "error");
    if (opens !== p.opens_on || closes !== p.closes_on || confirmed !== p.confirmed) {
      await sql`update metrics.periods set opens_on = ${opens}, closes_on = ${closes}, confirmed = ${confirmed} where school_year = ${year.id} and key = ${p.key}`;
      changed++;
    }
  }
  await audit(u, "settings", "calendar", { year: year.id, changed });
  revalidatePath("/", "layout");
  back("/admin/calendar", `Saved ${changed} period${changed === 1 ? "" : "s"}.`);
}

export async function addPeriod(fd: FormData) {
  const u = await owner();
  const year = await getYear(str(fd, "year"));
  const key = str(fd, "key");
  const kind = str(fd, "kind");
  const opens = str(fd, "opens_on");
  const closes = str(fd, "closes_on") || opens;
  if (!key || !["cycle", "eval", "sprint", "survey", "deadline"].includes(kind) || !ISO_DATE.test(opens) || !ISO_DATE.test(closes)) back("/admin/calendar", "Enter a name, kind, and dates.", "error");
  const rows = await sql`
    insert into metrics.periods (school_year, key, kind, opens_on, closes_on, sort_order)
    values (${year.id}, ${key}, ${kind}, ${opens}, ${closes}, (select coalesce(max(sort_order), 0) + 1 from metrics.periods where school_year = ${year.id}))
    on conflict do nothing returning key`;
  if (!rows.length) back("/admin/calendar", `${key} already exists.`, "error");
  // Keep the list in date order.
  await sql`update metrics.periods p set sort_order = o.rn from (
              select key, row_number() over (order by opens_on, sort_order) as rn from metrics.periods where school_year = ${year.id}) o
            where p.school_year = ${year.id} and p.key = o.key`;
  await audit(u, "settings", "calendar", { added: key });
  revalidatePath("/", "layout");
  back("/admin/calendar", `Added ${key}.`);
}

export async function deletePeriod(fd: FormData) {
  const u = await owner();
  const year = await getYear(str(fd, "year"));
  const key = str(fd, "key");
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from metrics.measurements m join metrics.goals g on g.id = m.goal_id where g.school_year = ${year.id} and m.period = ${key}`;
  const [{ used }] = await sql<{ used: number }[]>`select count(*)::int as used from metrics.goals where school_year = ${year.id} and measured_at = ${key}`;
  if (n || used) back("/admin/calendar", `${key} has numbers saved or is a goal's measurement period, so it can't be deleted.`, "error");
  await sql`delete from metrics.periods where school_year = ${year.id} and key = ${key}`;
  await audit(u, "settings", "calendar", { deleted: key });
  back("/admin/calendar", `Deleted ${key}.`);
}

// ---------- Settings ----------

export async function saveSettings(fd: FormData) {
  const u = await owner();
  const vals = { close_points: str(fd, "close_points"), no_change_points: str(fd, "no_change_points"), small_n: str(fd, "small_n"), enrolled_status: str(fd, "enrolled_status") };
  for (const k of ["close_points", "no_change_points", "small_n"] as const) {
    if (!Number.isFinite(Number(vals[k])) || Number(vals[k]) < 0 || vals[k] === "") back("/admin/settings", "Thresholds must be numbers.", "error");
  }
  if (!vals.enrolled_status) back("/admin/settings", "Enter the enrolled status label.", "error");
  for (const [k, v] of Object.entries(vals)) {
    await sql`insert into metrics.settings (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`;
  }
  await audit(u, "settings", "thresholds", vals);
  revalidatePath("/", "layout");
  back("/admin/settings", "Saved.");
}

// ---------- School years ----------

export async function setYearLocked(fd: FormData) {
  const u = await owner();
  const year = await getYear(str(fd, "year"));
  const locked = str(fd, "locked") === "true";
  await sql`update metrics.school_years set locked = ${locked} where id = ${year.id}`;
  await audit(u, "year_change", year.id, { locked });
  revalidatePath("/", "layout");
  back("/admin/years", `${year.id} ${locked ? "locked" : "unlocked"}.`);
}

export async function setCurrentYear(fd: FormData) {
  const u = await owner();
  const year = await getYear(str(fd, "year"));
  await sql.begin(async (tx) => {
    await tx`update metrics.school_years set is_current = false`;
    await tx`update metrics.school_years set is_current = true where id = ${year.id}`;
  });
  await audit(u, "year_change", year.id, { current: true });
  revalidatePath("/", "layout");
  back("/admin/years", `${year.id} is now the current year.`);
}

/** Next year's goals are a data change, not a rebuild: copy goals and the calendar, with this year's results as the new baselines. */
export async function startNewYear(fd: FormData) {
  const u = await owner();
  const from = await getYear(str(fd, "from"));
  const id = str(fd, "id");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  if (!/^SY\d{2}-\d{2}$/.test(id)) back("/admin/years", "Name the year like SY27-28.", "error");
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || end <= start) back("/admin/years", "Enter start and end dates.", "error");
  if ((await listYears()).some((y) => y.id === id)) back("/admin/years", `${id} already exists.`, "error");
  const scored = await scoreGoals(from, await getGoals(from.id, { includeInactive: true }));
  const shiftDays = Math.round((Date.parse(start) - Date.parse(from.start_date)) / 86_400_000);
  await sql.begin(async (tx) => {
    await tx`insert into metrics.school_years (id, start_date, end_date) values (${id}, ${start}, ${end})`;
    await tx`
      insert into metrics.periods (school_year, key, kind, opens_on, closes_on, sort_order, confirmed)
      select ${id}, key, kind, opens_on + ${shiftDays}::int, closes_on + ${shiftDays}::int, sort_order, false
      from metrics.periods where school_year = ${from.id}`;
    for (const { goal: g, ev } of scored) {
      const { id: _id, school_year: _sy, derive_rule, ...rest } = g;
      void _id;
      void _sy;
      await tx`insert into metrics.goals ${tx({
        ...rest,
        derive_rule: derive_rule ? (tx.json(derive_rule as never) as unknown as string) : null,
        school_year: id,
        target_confirmed: false,
        baseline_value: ev.value !== null ? Math.round(ev.value * 10) / 10 : null,
        baseline_n: ev.current && ev.current.denominator !== null ? `${ev.current.numerator}/${ev.current.denominator}` : null,
        baseline_note: ev.current ? `${from.id} ${ev.current.period}` : `${from.id}: no result`,
        doc_change: null,
      } as never)}`;
    }
  });
  await audit(u, "year_change", id, { created_from: from.id, goals: scored.length });
  back("/admin/years", `Created ${id} with ${scored.length} goals and the calendar shifted by ${shiftDays} days. Update targets in Goals and dates in Calendar, then set it as current. Load its roster with Import.`);
}

export async function deleteYear(fd: FormData) {
  const u = await owner();
  const year = await getYear(str(fd, "year"));
  if (str(fd, "confirm") !== `DELETE ${year.id}`) back("/admin/years", `Type DELETE ${year.id} to confirm.`, "error");
  if (year.is_current) back("/admin/years", "Make another year current before deleting this one.", "error");
  await sql`delete from metrics.school_years where id = ${year.id}`;
  await audit(u, "year_change", year.id, { deleted: true });
  revalidatePath("/", "layout");
  back("/admin/years", `Deleted ${year.id} and everything in it.`);
}

// ---------- Sample data ----------

export async function loadSamples() {
  const u = await owner();
  const year = await getYear();
  let msg: string;
  try {
    msg = await loadSampleData(year.id, u.email);
  } catch (e) {
    back("/admin/years", errMsg(e), "error");
  }
  revalidatePath("/", "layout");
  back("/admin/years", msg);
}

export async function removeSamples() {
  const u = await owner();
  const year = await getYear();
  const msg = await deleteSampleData(year.id);
  await audit(u, "year_change", year.id, { deleted_samples: true });
  revalidatePath("/", "layout");
  back("/admin/years", msg);
}
