import "server-only";
import { loadDataset, type Dataset } from "./data";
import { summarize } from "./summary";
import { standingAt, fmtAvg } from "./rules";
import { todayISO } from "./dates";

export type Table = { header: string[]; rows: unknown[][] };

export const FEED_DATASETS = ["scores", "steps", "followthrough", "tracks", "residents", "indicators", "cfs", "cycles", "library"] as const;

/** Stable-ID tables shared with the Program Metrics App. One row per score / assigned step / follow-through result / track change. */
export function feedTable(ds: Dataset, name: string): Table | null {
  const res = new Map(ds.residents.map((r) => [r.id, r]));
  const pid = (id: string) => res.get(id)?.person_id ?? "";
  const today = todayISO();
  switch (name) {
    case "scores":
      return {
        header: ["observation_id", "person_id", "resident", "observer", "observed_date", "cycle", "type", "involvement", "indicator", "score", "expected_status", "cfs_demonstrated"],
        rows: ds.observations.flatMap((o) => o.scores.map((s) => [o.id, pid(o.resident_id), res.get(o.resident_id)?.full_name, o.observer_id, o.observed_date, o.cycle, o.type, o.involvement, s.indicator, s.score, s.expected_status, s.cfs_demonstrated.join(";")])),
      };
    case "steps":
      return {
        header: ["assignment_id", "observation_id", "person_id", "observer", "observed_date", "cycle", "slot", "step_id", "custom_text", "legacy_text", "indicator", "wording_sent"],
        rows: ds.observations.flatMap((o) => o.steps.map((s) => [s.id, o.id, pid(o.resident_id), o.observer_id, o.observed_date, o.cycle, s.slot, s.step_id, s.custom_text, s.legacy_text, s.indicator, s.wording_snapshot])),
      };
    case "followthrough": {
      const assign = new Map(ds.observations.flatMap((o) => o.steps.map((s) => [s.id, s])));
      return {
        header: ["observation_id", "person_id", "observed_date", "cycle", "prior_assignment_id", "step_id", "result", "note"],
        rows: ds.observations.flatMap((o) => o.followthrough.map((f) => [o.id, pid(o.resident_id), o.observed_date, o.cycle, f.prior_assignment_id, assign.get(f.prior_assignment_id)?.step_id ?? null, f.result, f.note])),
      };
    }
    case "tracks":
      return {
        header: ["person_id", "resident", "row_type", "track", "tier", "effective_from", "reason", "decided_by", "set_by", "previous_track", "previous_tier", "recorded_at"],
        rows: ds.residents.flatMap((r) => {
          const rules = ds.rules.get(r.id)!;
          const now = standingAt(today, ds.cfg, rules);
          return [
            [r.person_id, r.full_name, "current", now.track, now.tier, today, "", "", "", "", "", ""],
            ...rules.tracks.map((t) => [r.person_id, r.full_name, "change", t.track, t.tier, t.effective_from, t.reason, t.decided_by, t.set_by, t.previous_track, t.previous_tier, t.created_at]),
          ];
        }),
      };
    case "residents":
      return {
        header: ["person_id", "resident_id", "full_name", "preferred_first", "last_name", "status", "active", "advisor", "school", "campus", "grade_band", "content", "grade", "mentor_teacher", "email"],
        rows: ds.residents.map((r) => [r.person_id, r.id, r.full_name, r.preferred_first, r.last_name, r.status, r.active, r.advisor_code, r.school, r.campus, r.grade_band, r.content, r.grade, r.mentor_teacher, r.email]),
      };
    case "indicators":
      return { header: ["code", "name", "domain", "area", "scored", "introduced_cycle", "first_scored_cycle", "tier"], rows: ds.cfg.indicators.map((i) => [i.code, i.name, i.domain, i.area, i.scored, i.introduced_cycle, i.first_scored_cycle, i.tier]) };
    case "cfs":
      return { header: ["cfs_id", "indicator", "short_label", "full_text"], rows: ds.cfg.cfs.map((c) => [c.id, c.indicator, c.short_label, c.full_text]) };
    case "cycles":
      return { header: ["cycle", "theme", "start_date", "end_date"], rows: ds.cfg.cycles.map((c) => [c.number, c.theme, c.start_date, c.end_date]) };
    case "library":
      return {
        header: ["id", "indicator", "text", "cfs_ids", "link_type", "look_fors", "practice_rep", "resource_url", "tags", "skill_level", "grade_band", "content_area", "status", "is_legacy", "replacement_id", "intro_cycle"],
        rows: ds.steps.map((s) => [s.id, s.indicator, s.text, s.cfs_ids.join("; "), s.link_type, s.look_fors, s.practice_rep, s.resource_url, s.tags.join(", "), s.skill_level, s.grade_band, s.content_area, s.status, s.is_legacy, s.replacement_id, s.intro_cycle]),
      };
  }
  return null;
}

/** The Latest grid as a table (matches the workbook's Latest tab). */
export function latestTable(ds: Dataset): Table {
  const today = todayISO();
  const inds = ds.cfg.scoredIndicators;
  return {
    header: ["Resident", "Person ID", "Track", "Tier", "Advisor", "School", "Campus", ...inds.map((i) => i.code), "100% AVG", "Prep", "Instruction", "Last Obs", "Days Since", "Obs This Cycle", "Action Step", "Lesson Type", ...ds.cfg.cycles.filter((c) => c.number > 0).map((c) => `C${c.number} Done`), "Status"],
    rows: ds.residents.filter((r) => r.active).map((r) => {
      const obs = ds.byResident.get(r.id) ?? [];
      const s = summarize(r, obs, ds.cfg, ds.rules.get(r.id)!, today);
      return [
        r.full_name, r.person_id, s.standing.trackName, s.standing.tier, r.advisor_code, r.school, r.campus,
        ...inds.map((i) => s.latest.get(i.code)?.score ?? (s.expected.has(i.code) ? "missing" : "")),
        fmtAvg(s.areaAvg["Learning Environment"]), fmtAvg(s.areaAvg["Intellectual Prep"]), fmtAvg(s.areaAvg["Responsive Instruction"]),
        s.lastObs?.observed_date ?? "", s.daysSince ?? "", s.obsThisCycle, s.lastObs?.steps.map((x) => `${x.indicator ?? ""} - ${x.wording_snapshot}`).join(" | ") ?? "", s.lastObs?.involvement ?? "",
        ...ds.cfg.cycles.filter((c) => c.number > 0).map((c) => (s.cyclesDone[c.number] ? "Yes" : "No")), r.status,
      ];
    }),
  };
}

export { loadDataset };
