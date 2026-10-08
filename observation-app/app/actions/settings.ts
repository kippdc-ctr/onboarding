"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { refreshDevice, requireAdmin } from "@/lib/auth";
import { hashPasscode, randomToken } from "@/lib/crypto";
import { getConfig, getSettings } from "@/lib/data";

const back = (msg: string, err = false, anchor = "") => redirect(`/settings?${err ? "error" : "ok"}=${encodeURIComponent(msg)}${anchor}`);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function put(key: string, value: string) {
  await sql`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`;
}

const GENERAL = ["observation_types", "involvement_levels", "campuses", "max_action_steps", "edit_window_days", "advance_threshold", "advance_observations", "expected_obs_per_cycle", "rubric_note", "email_next_steps"] as const;
const NUMERIC: Record<string, [number, number]> = { max_action_steps: [1, 5], edit_window_days: [0, 365], advance_threshold: [1, 4], advance_observations: [1, 10], expected_obs_per_cycle: [0, 50] };

export async function saveGeneral(form: FormData) {
  const me = await requireAdmin();
  const before = await getSettings();
  const changed: Record<string, [string, string]> = {};
  for (const k of GENERAL) {
    let v = String(form.get(k) ?? "").replace(/\r/g, "").trim();
    if (NUMERIC[k]) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < NUMERIC[k][0] || n > NUMERIC[k][1]) back(`${k.replace(/_/g, " ")} must be between ${NUMERIC[k][0]} and ${NUMERIC[k][1]}.`, true);
      v = String(n);
    }
    if (v !== (before[k] ?? "")) {
      changed[k] = [before[k] ?? "", v];
      await put(k, v);
    }
  }
  const snap = form.get("email_snapshot_default") === "on" ? "true" : "false";
  if (snap !== before.email_snapshot_default) { changed.email_snapshot_default = [before.email_snapshot_default, snap]; await put("email_snapshot_default", snap); }
  await audit(me.id, "settings.general", "settings", "", changed);
  back("Settings saved.");
}

export async function saveCalendar(form: FormData) {
  const me = await requireAdmin();
  const cfg = await getConfig();
  const changes: unknown[] = [];
  for (const c of cfg.cycles) {
    const theme = String(form.get(`theme_${c.number}`) ?? c.theme).trim();
    const start = String(form.get(`start_${c.number}`));
    const end = String(form.get(`end_${c.number}`));
    if (!isDate(start) || !isDate(end) || end < start) back(`Cycle ${c.number}: enter a start and end date (end after start).`, true);
    if (theme !== c.theme || start !== c.start_date || end !== c.end_date) {
      await sql`update cycles set theme = ${theme}, start_date = ${start}, end_date = ${end} where number = ${c.number}`;
      changes.push({ cycle: c.number, theme, start, end });
    }
  }
  const sorted = [...cfg.cycles].map((c) => ({ n: c.number, s: String(form.get(`start_${c.number}`)), e: String(form.get(`end_${c.number}`)) })).sort((a, b) => a.s.localeCompare(b.s));
  for (let i = 1; i < sorted.length; i++) if (sorted[i].s <= sorted[i - 1].e) back(`Cycle ${sorted[i].n} starts before Cycle ${sorted[i - 1].n} ends.`, true);
  const newNo = String(form.get("new_number") ?? "").trim();
  if (newNo) {
    const start = String(form.get("new_start"));
    const end = String(form.get("new_end"));
    if (!isDate(start) || !isDate(end)) back("New cycle: enter both dates.", true);
    await sql`insert into cycles (number, theme, start_date, end_date) values (${Number(newNo)}, ${String(form.get("new_theme") ?? "")}, ${start}, ${end}) on conflict (number) do nothing`;
    changes.push({ added: newNo });
  }
  await audit(me.id, "settings.calendar", "cycles", "", changes);
  back("Cycle calendar saved. Existing observations keep the cycle they were saved with.", false, "#calendar");
}

export async function saveSchedule(form: FormData) {
  const me = await requireAdmin();
  const cfg = await getConfig();
  const changes: unknown[] = [];
  for (const i of cfg.indicators) {
    const scored = form.get(`scored_${i.code}`) === "on";
    const fsc = form.get(`first_${i.code}`) === "" ? null : Number(form.get(`first_${i.code}`));
    const intro = form.get(`intro_${i.code}`) === "" ? null : Number(form.get(`intro_${i.code}`));
    const tier = form.get(`tier_${i.code}`) === "" ? null : Number(form.get(`tier_${i.code}`));
    const name = String(form.get(`name_${i.code}`) ?? i.name).trim() || i.name;
    if (scored !== i.scored || fsc !== i.first_scored_cycle || intro !== i.introduced_cycle || tier !== i.tier || name !== i.name) {
      await sql`update indicators set scored = ${scored}, first_scored_cycle = ${fsc}, introduced_cycle = ${intro}, tier = ${tier}, name = ${name} where code = ${i.code}`;
      changes.push({ code: i.code, scored, first_scored_cycle: fsc, introduced_cycle: intro, tier, name });
    }
  }
  for (const t of cfg.tiers) {
    const cc = Number(form.get(`tiercycle_${t.number}`));
    const name = String(form.get(`tiername_${t.number}`) ?? t.name).trim() || t.name;
    if (cc !== t.calendar_cycle || name !== t.name) {
      await sql`update tiers set calendar_cycle = ${cc}, name = ${name} where number = ${t.number}`;
      changes.push({ tier: t.number, calendar_cycle: cc, name });
    }
  }
  const newTrack = String(form.get("new_track") ?? "").trim();
  if (newTrack) {
    const code = newTrack.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    await sql`insert into tracks (code, name, follows_calendar, sort) values (${code}, ${newTrack}, false, ${cfg.tracks.length + 1}) on conflict (code) do nothing`;
    changes.push({ track_added: newTrack });
  }
  await audit(me.id, "settings.schedule", "indicators", "", changes);
  back("Indicator schedule saved. Expected indicators update everywhere right away.", false, "#schedule");
}

export async function saveObservers(form: FormData) {
  const me = await requireAdmin();
  const cfg = await getConfig();
  for (const o of cfg.observers) {
    const row = {
      name: String(form.get(`name_${o.id}`) ?? o.name).trim() || o.name,
      full_name: String(form.get(`full_${o.id}`) ?? "").trim(),
      advisor_code: String(form.get(`code_${o.id}`) ?? "").trim(),
      email: String(form.get(`email_${o.id}`) ?? "").trim(),
      is_admin: o.id === me.id ? true : form.get(`admin_${o.id}`) === "on",
    };
    await sql`update observers set ${sql(row)} where id = ${o.id}`;
  }
  await audit(me.id, "settings.observers", "observers");
  back("Observers saved.", false, "#observers");
}

export async function saveAccess(form: FormData) {
  const me = await requireAdmin();
  const s = await getSettings();
  const enabled = form.get("passcode_enabled") === "on";
  const newPass = String(form.get("new_passcode") ?? "").trim();
  if (newPass && newPass.length < 6) back("Use at least 6 characters for the passcode.", true, "#access");
  if (enabled && !newPass && !s.passcode_hash) back("Set a passcode before turning it on.", true, "#access");
  await put("passcode_enabled", enabled ? "true" : "false");
  let hash = s.passcode_hash;
  if (newPass) {
    hash = hashPasscode(newPass);
    await put("passcode_hash", hash);
  }
  await refreshDevice({ ...s, passcode_hash: hash, passcode_enabled: enabled ? "true" : "false" });
  await audit(me.id, "settings.access", "settings", "", { passcode_enabled: enabled, passcode_changed: !!newPass });
  back(newPass ? "Passcode changed. Other devices will be asked for the new one." : `Passcode ${enabled ? "on" : "off"}.`, false, "#access");
}

export async function rotateAccess(form: FormData) {
  const me = await requireAdmin();
  const newPass = String(form.get("rotate_passcode") ?? "").trim();
  if (newPass.length < 6) back("Enter a new passcode (6+ characters) to rotate.", true, "#access");
  const s = await getSettings();
  const key = randomToken(24);
  const version = String(Number(s.auth_version || "1") + 1);
  const hash = hashPasscode(newPass);
  await put("access_key", key);
  await put("auth_version", version);
  await put("passcode_hash", hash);
  await refreshDevice({ ...s, access_key: key, auth_version: version, passcode_hash: hash });
  await audit(me.id, "settings.rotated", "settings");
  redirect(`/settings?rotated=1#access`);
}

export async function rotateFeedToken() {
  const me = await requireAdmin();
  await put("feed_token", randomToken(24));
  await audit(me.id, "settings.feed_token_rotated", "settings");
  back("New data feed token created. Update it in the Program Metrics App.", false, "#feed");
}

export async function deleteSamples(form: FormData) {
  const me = await requireAdmin();
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE SAMPLES") back("Type DELETE SAMPLES to confirm.", true, "#data");
  const ids = (await sql<{ id: string }[]>`select id from residents where is_sample`).map((r) => r.id);
  if (ids.length) {
    await sql.begin(async (tx) => {
      await tx`delete from observations where resident_id = any(${ids})`;
      await tx`delete from residents where id = any(${ids})`;
    });
  }
  await audit(me.id, "data.samples_deleted", "residents", "", { count: ids.length });
  back(`Deleted ${ids.length} sample residents and their observations.`, false, "#data");
}
