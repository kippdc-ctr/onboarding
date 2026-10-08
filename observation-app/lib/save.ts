import "server-only";
import { sql } from "./db";
import { audit } from "./audit";
import { getConfig, getObservation, getResident, rulesForOne, type Observer } from "./data";
import type { Draft, SubmitPayload } from "./draft";
import { cycleForDate, daysBetween, expectedIndicators, residentCycles } from "./rules";
import { todayISO } from "./dates";

export class SaveError extends Error {}

const FOLLOW = new Set(["yes", "partially", "no", "not_observed"]);
const clip = (s: unknown, n = 10_000) => String(s ?? "").slice(0, n);

/** The assignments from the resident's most recent submitted observation before this one. */
export async function priorAssignments(residentId: string, observedAt: string, excludeId?: string) {
  const [prev] = await sql<{ id: string }[]>`
    select id from observations
    where resident_id = ${residentId} and status = 'submitted' and deleted_at is null and observed_at < ${observedAt}
      ${excludeId ? sql`and id <> ${excludeId}` : sql``}
    order by observed_at desc, created_at desc limit 1`;
  if (!prev) return [];
  return sql<{ id: string; wording_snapshot: string }[]>`select id, wording_snapshot from observation_action_steps where observation_id = ${prev.id} order by slot`;
}

export function canEdit(o: { observer_id: string; submitted_at: string | null; created_at: string; status: string }, me: Observer, windowDays: number): boolean {
  if (o.status === "draft") return o.observer_id === me.id || me.is_admin;
  const since = o.submitted_at ?? o.created_at;
  const within = daysBetween(since.slice(0, 10), todayISO()) <= windowDays;
  return (within && o.observer_id === me.id) || me.is_admin;
}

/** Validate and save a draft or a submission. Returns the observation id. Idempotent on draft.clientId. */
export async function saveObservation(p: SubmitPayload, me: Observer): Promise<string> {
  const d = p.draft as Draft;
  const status = p.status === "draft" ? "draft" : "submitted";
  const cfg = await getConfig();
  if (!d || typeof d !== "object" || !d.clientId) throw new SaveError("Missing observation data.");

  const resident = await getResident(String(d.residentId));
  if (!resident) throw new SaveError("Pick a resident.");
  const observer = cfg.observers.find((o) => o.id === d.observerId) ?? me;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? "")) throw new SaveError("Enter the observation date.");
  if (d.date > todayISO()) throw new SaveError("The observation date can't be in the future.");

  // Existing row: either this device already sent it (retry) or it's an edit.
  const [byClient] = await sql<{ id: string; status: string }[]>`select id, status from observations where client_id = ${d.clientId} and deleted_at is null`;
  const existingId = d.observationId || byClient?.id || null;
  let existingAt: string | null = null;
  let existingDate: string | null = null;
  let lateEdit = false;
  if (existingId) {
    const ex = await getObservation(existingId);
    if (!ex) throw new SaveError("That observation was deleted.");
    // A retry of something already submitted from this device: nothing to do.
    if (byClient && byClient.status === "submitted" && !d.observationId) return byClient.id;
    const windowDays = Number(cfg.settings.edit_window_days) || 7;
    if (!canEdit(ex, me, windowDays)) throw new SaveError("The edit window for this observation has closed. Ask Ashley (admin) to make the change.");
    lateEdit = ex.status === "submitted" && !canEdit(ex, { ...me, is_admin: false }, windowDays);
    existingAt = ex.observed_at;
    existingDate = ex.observed_date;
  }

  const rules = await rulesForOne(resident.id);
  const cycles = residentCycles(cfg.cycles, rules.cycleOverrides);
  const autoCycle = cycleForDate(d.date, cycles);
  const cycle = d.cycleOverride !== null && d.cycleOverride !== undefined && cfg.cycles.some((c) => c.number === Number(d.cycleOverride)) ? Number(d.cycleOverride) : autoCycle;
  const expected = expectedIndicators(d.date, cfg, rules);

  // Scores
  const validInd = new Set(cfg.scoredIndicators.map((i) => i.code));
  const scores: { indicator: string; score: number | null; cfs: string[]; comment: string; expected_status: "expected" | "early" }[] = [];
  for (const [code, s] of Object.entries(d.scores ?? {})) {
    if (!validInd.has(code) || !s) continue;
    const score = s.score === null || s.score === undefined ? null : Number(s.score);
    if (score !== null && ![1, 2, 3, 4].includes(score)) throw new SaveError(`Score for ${code} must be 1 to 4.`);
    const allowed = new Set(cfg.cfs.filter((c) => c.indicator === code).map((c) => c.id));
    const cfs = (s.cfs ?? []).filter((c) => allowed.has(c));
    const comment = clip(s.comment, 2000).trim();
    if (score === null && !comment && !cfs.length) continue;
    scores.push({ indicator: code, score, cfs, comment, expected_status: expected.has(code) ? "expected" : "early" });
  }

  // Action steps
  const maxSteps = Math.max(1, Number(cfg.settings.max_action_steps) || 2);
  const rawSteps = (d.steps ?? []).filter((s) => (s.kind === "library" ? !!s.stepId : !!s.text?.trim()));
  if (rawSteps.length > maxSteps) throw new SaveError(`Choose at most ${maxSteps} action steps.`);
  const steps: { step_id: string | null; custom_text: string | null; custom_look_fors: string; custom_practice: string; indicator: string | null; personalization_note: string; wording_snapshot: string }[] = [];
  for (const s of rawSteps) {
    if (s.kind === "library") {
      const [st] = await sql<{ id: string; text: string; indicator: string; status: string }[]>`select id, text, indicator, status from action_steps where id = ${s.stepId}`;
      if (!st) throw new SaveError("One of the chosen action steps is no longer in the library.");
      steps.push({ step_id: st.id, custom_text: null, custom_look_fors: "", custom_practice: "", indicator: st.indicator, personalization_note: clip(s.note, 1000).trim(), wording_snapshot: st.text });
    } else {
      const text = clip(s.text, 2000).trim();
      const ind = cfg.indicators.some((i) => i.code === s.indicator) ? s.indicator : null;
      steps.push({ step_id: null, custom_text: text, custom_look_fors: clip(s.lookFors, 2000).trim(), custom_practice: clip(s.practice, 2000).trim(), indicator: ind, personalization_note: clip(s.note, 1000).trim(), wording_snapshot: text });
    }
  }

  // Keep the original time on edits; use the real time for today's observations so same-day observations stay ordered.
  const observedAt =
    existingAt && existingDate === d.date ? existingAt : d.date === todayISO() ? new Date().toISOString() : `${d.date}T12:00:00-05:00`;
  const prior = await priorAssignments(resident.id, observedAt, existingId ?? undefined);
  const follow = prior.map((a) => {
    const f = d.follow?.[a.id];
    const result = f && FOLLOW.has(f.result) ? f.result : "";
    return { prior_assignment_id: a.id, result, note: clip(f?.note, 500).trim() };
  });

  if (status === "submitted") {
    if (!d.type) throw new SaveError("Choose the observation type.");
    if (!steps.length) throw new SaveError("Choose at least one action step.");
    const missingFollow = follow.filter((f) => !f.result);
    if (missingFollow.length) {
      // An offline submission can be made before a newer observation lands from the other device. Rather than
      // rejecting it, record those as "not observed" with a note.
      if (Object.keys(d.follow ?? {}).length) for (const f of missingFollow) Object.assign(f, { result: "not_observed", note: f.note || "Not recorded (an earlier observation arrived after this one was started)." });
      else throw new SaveError("Record follow-through on the last action step (or choose Not observed).");
    }
  }

  const row = {
    client_id: d.clientId,
    resident_id: resident.id,
    observer_id: observer.id,
    type: clip(d.type, 100),
    involvement: clip(d.involvement, 100),
    observed_at: observedAt,
    observed_date: d.date,
    cycle,
    cycle_overridden: cycle !== autoCycle,
    status,
    internal_comments: clip(d.internal).trim(),
    affirming: clip(d.affirming).trim(),
    adjusting: clip(d.adjusting).trim(),
    send_flag: !!d.sendFlag,
    include_snapshot: d.includeSnapshot !== false,
    next_note: clip(d.nextNote, 2000).trim(),
  };

  const id = await sql.begin(async (tx) => {
    let oid: string;
    if (existingId) {
      const [prev] = await tx<{ status: string; submitted_at: string | null }[]>`select status, submitted_at from observations where id = ${existingId} for update`;
      const submittedAt = prev.submitted_at ?? (status === "submitted" ? new Date() : null);
      // Keep the original client id; an edit never turns a submission back into a draft.
      const { client_id: _c, ...rest } = row;
      void _c;
      await tx`update observations set ${tx({ ...rest, status: prev.status === "submitted" ? "submitted" : status })}, submitted_at = ${submittedAt}, updated_at = now() where id = ${existingId}`;
      oid = existingId;
      await tx`delete from step_followthrough where observation_id = ${oid}`;
      await tx`delete from observation_scores where observation_id = ${oid}`;
      // Keep assignment ids stable for slots that still hold the same step (later follow-through points at them).
      const old = await tx<{ id: string; slot: number; step_id: string | null; custom_text: string | null }[]>`select id, slot, step_id, custom_text from observation_action_steps where observation_id = ${oid}`;
      const keep = new Set<string>();
      for (const [i, s] of steps.entries()) {
        const match = old.find((o) => o.slot === i + 1 && o.step_id === s.step_id && (o.custom_text ?? null) === (s.custom_text ?? null));
        if (match) {
          keep.add(match.id);
          await tx`update observation_action_steps set ${tx({ ...s })} where id = ${match.id}`;
        }
      }
      await tx`delete from observation_action_steps where observation_id = ${oid} and not (id = any(${[...keep]}))`;
      for (const [i, s] of steps.entries()) {
        const match = old.find((o) => o.slot === i + 1 && keep.has(o.id));
        if (!match) await tx`insert into observation_action_steps ${tx({ ...s, observation_id: oid, slot: i + 1 })}`;
      }
    } else {
      const [ins] = await tx<{ id: string }[]>`
        insert into observations ${tx({ ...row, submitted_at: status === "submitted" ? new Date() : null })} returning id`;
      oid = ins.id;
      for (const [i, s] of steps.entries()) await tx`insert into observation_action_steps ${tx({ ...s, observation_id: oid, slot: i + 1 })}`;
    }
    for (const s of scores) {
      await tx`insert into observation_scores (observation_id, indicator, score, expected_status, cfs_demonstrated, comment)
               values (${oid}, ${s.indicator}, ${s.score}, ${s.expected_status}, ${s.cfs}, ${s.comment})`;
    }
    for (const f of follow) {
      if (!f.result) continue;
      await tx`insert into step_followthrough (observation_id, prior_assignment_id, result, note) values (${oid}, ${f.prior_assignment_id}, ${f.result}, ${f.note})`;
    }
    return oid;
  });

  await audit(me.id, existingId ? (status === "draft" ? "observation.draft_updated" : "observation.edited") : status === "draft" ? "observation.draft_saved" : "observation.submitted", "observation", id, {
    resident: resident.full_name,
    observer: observer.id,
    date: d.date,
    edited_after_window: lateEdit || undefined,
  });
  return id;
}
