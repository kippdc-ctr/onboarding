import "server-only";
import type { ActionStep, Config, Observation, Resident } from "./data";
import { buildEmail } from "./email";
import { SCORE_LABELS } from "./rules";
import { formatDate } from "./dates";

export function emailFor(o: Observation, r: Resident, cfg: Config, steps: ActionStep[]) {
  const observer = cfg.observers.find((x) => x.id === o.observer_id);
  return buildEmail({
    firstName: r.preferred_first || r.full_name.split(" ")[0],
    observerName: observer?.full_name || observer?.name || "",
    dateLabel: formatDate(o.observed_date),
    affirming: o.affirming,
    adjusting: o.adjusting,
    steps: o.steps.map((s) => {
      const st = s.step_id ? steps.find((x) => x.id === s.step_id) : null;
      return st
        ? { text: s.wording_snapshot, lookFors: st.look_fors, practice: st.practice_rep, resourceUrl: st.resource_url, note: s.personalization_note }
        : { text: s.wording_snapshot, lookFors: s.custom_look_fors, practice: s.custom_practice, resourceUrl: "", note: s.personalization_note };
    }),
    includeSnapshot: o.include_snapshot,
    snapshot: cfg.indicators
      .filter((i) => o.scores.some((s) => s.indicator === i.code && s.score))
      .map((i) => {
        const s = o.scores.find((x) => x.indicator === i.code)!;
        const all = cfg.cfs.filter((c) => c.indicator === i.code);
        return {
          code: i.code,
          name: i.short_label,
          score: s.score!,
          label: SCORE_LABELS[s.score!],
          demonstrated: all.filter((c) => s.cfs_demonstrated.includes(c.id)).map((c) => c.full_text),
          toBuild: all.filter((c) => !s.cfs_demonstrated.includes(c.id)).map((c) => c.full_text),
        };
      }),
    nextNote: o.next_note,
    rubricNote: cfg.settings.rubric_note ?? "",
  });
}
