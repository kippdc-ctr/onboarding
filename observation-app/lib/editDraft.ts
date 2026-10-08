import "server-only";
import { randomUUID } from "node:crypto";
import type { Observation } from "./data";
import type { Draft } from "./draft";

/** Turn a saved observation (draft or submitted) back into the scoring screen's draft shape. */
export function draftFromObservation(o: Observation): Draft {
  return {
    clientId: o.client_id ?? randomUUID(),
    observationId: o.id,
    residentId: o.resident_id,
    observerId: o.observer_id,
    type: o.type,
    involvement: o.involvement,
    date: o.observed_date,
    cycleOverride: o.cycle_overridden ? o.cycle : null,
    follow: Object.fromEntries(o.followthrough.map((f) => [f.prior_assignment_id, { result: f.result, note: f.note }])),
    scores: Object.fromEntries(o.scores.map((s) => [s.indicator, { score: s.score, cfs: s.cfs_demonstrated, comment: s.comment }])),
    extra: o.scores.filter((s) => s.expected_status === "early").map((s) => s.indicator),
    steps: o.steps.map((s) =>
      s.step_id
        ? { kind: "library" as const, stepId: s.step_id, note: s.personalization_note }
        : { kind: "custom" as const, text: s.custom_text ?? s.wording_snapshot, indicator: s.indicator ?? "", lookFors: s.custom_look_fors, practice: s.custom_practice, note: s.personalization_note },
    ),
    internal: o.internal_comments,
    affirming: o.affirming,
    adjusting: o.adjusting,
    sendFlag: o.send_flag,
    includeSnapshot: o.include_snapshot,
    nextNote: o.next_note,
  };
}
