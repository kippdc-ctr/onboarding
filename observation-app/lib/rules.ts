// Pure rules for cycles, tiers, tracks, and which indicators a resident is expected to be scored on.
// No database or framework imports, so these can be unit tested (lib/rules.test.ts).

export type Cycle = { number: number; theme: string; start_date: string; end_date: string };
export type Indicator = {
  code: string;
  name: string;
  short_label: string;
  domain: string;
  area: string;
  sort: number;
  scored: boolean;
  introduced_cycle: number | null;
  first_scored_cycle: number | null;
  tier: number | null;
};
export type Tier = { number: number; name: string; calendar_cycle: number };
export type Track = { code: string; name: string; follows_calendar: boolean; sort: number };
export type TrackEntry = {
  id?: number;
  track: string;
  tier: number | null;
  effective_from: string;
  created_at?: string;
  reason?: string;
  decided_by?: string | null;
  set_by?: string | null;
  previous_track?: string | null;
  previous_tier?: number | null;
};
export type IndicatorOverride = { indicator: string; mode: "on" | "off"; effective_from: string; reason?: string };
export type CycleOverride = { cycle: number; start_date: string; end_date: string };

export type RulesConfig = { cycles: Cycle[]; indicators: Indicator[]; tiers: Tier[]; tracks: Track[] };
export type ResidentRules = { tracks: TrackEntry[]; overrides: IndicatorOverride[]; cycleOverrides: CycleOverride[] };

export const EMPTY_RULES: ResidentRules = { tracks: [], overrides: [], cycleOverrides: [] };

/** The resident's own calendar: the program calendar with any per-resident cycle dates swapped in. */
export function residentCycles(cycles: Cycle[], overrides: CycleOverride[] = []): Cycle[] {
  return cycles
    .map((c) => {
      const o = overrides.find((x) => x.cycle === c.number);
      return o ? { ...c, start_date: o.start_date, end_date: o.end_date } : c;
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/**
 * The cycle an observation date counts toward. Dates inside a cycle count toward it; dates between
 * cycles count toward the cycle that most recently ended; dates before the first cycle count toward it.
 */
export function cycleForDate(date: string, cycles: Cycle[]): number {
  const sorted = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (!sorted.length) return 0;
  const inside = sorted.find((c) => date >= c.start_date && date <= c.end_date);
  if (inside) return inside.number;
  const ended = sorted.filter((c) => c.end_date < date);
  return ended.length ? ended[ended.length - 1].number : sorted[0].number;
}

export function cycleStart(n: number | null, cycles: Cycle[]): string | null {
  if (n === null || n === undefined) return null;
  return cycles.find((c) => c.number === n)?.start_date ?? null;
}

/** The track entry in force on a date (latest effective_from on or before it; ties go to the newest entry). */
export function trackAt(entries: TrackEntry[], date: string): TrackEntry | null {
  const live = entries
    .filter((e) => e.effective_from <= date)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || String(a.created_at ?? a.id ?? "").localeCompare(String(b.created_at ?? b.id ?? "")));
  return live.length ? live[live.length - 1] : null;
}

/** The tier a Standard resident is on by the calendar (0 before Tier 1 starts). */
export function calendarTier(date: string, tiers: Tier[], cycles: Cycle[]): number {
  let t = 0;
  for (const tier of tiers) {
    const start = cycleStart(tier.calendar_cycle, cycles);
    if (start && date >= start && tier.number > t) t = tier.number;
  }
  return t;
}

export type Standing = { track: string; trackName: string; followsCalendar: boolean; tier: number };

export function standingAt(date: string, cfg: RulesConfig, rules: ResidentRules): Standing {
  const cycles = residentCycles(cfg.cycles, rules.cycleOverrides);
  const entry = trackAt(rules.tracks, date);
  const code = entry?.track ?? "standard";
  const def = cfg.tracks.find((t) => t.code === code);
  const followsCalendar = def ? def.follows_calendar : true;
  const tier = followsCalendar || entry?.tier == null ? calendarTier(date, cfg.tiers, cycles) : entry.tier;
  return { track: code, trackName: def?.name ?? code, followsCalendar, tier };
}

/**
 * Indicators the resident is expected to be scored on as of a date.
 * - Calendar-following tracks (Standard): an indicator is expected from the start date of its first-scored cycle.
 * - Hand-set tracks (Accelerated, Developing): indicators whose tier is at or below the resident's tier.
 * - Per-resident overrides turn single indicators on or off from their effective date.
 */
export function expectedIndicators(date: string, cfg: RulesConfig, rules: ResidentRules): Set<string> {
  const cycles = residentCycles(cfg.cycles, rules.cycleOverrides);
  const s = standingAt(date, cfg, rules);
  const out = new Set<string>();
  for (const ind of cfg.indicators) {
    if (!ind.scored) continue;
    if (s.followsCalendar) {
      const start = cycleStart(ind.first_scored_cycle, cycles);
      if (start && date >= start) out.add(ind.code);
    } else if (ind.tier !== null && ind.tier <= s.tier) {
      out.add(ind.code);
    }
  }
  for (const o of rules.overrides) {
    if (o.effective_from > date) continue;
    if (o.mode === "on") out.add(o.indicator);
    else out.delete(o.indicator);
  }
  return out;
}

export const SCORE_LABELS: Record<number, string> = {
  4: "Exceeds Expectations",
  3: "Meets Expectations",
  2: "Approaches Expectations",
  1: "Area of Concern",
};

export const SCORE_MEANINGS: Record<number, string> = {
  4: "Consistently exceeds expectations and/or 100% of students respond without prompting",
  3: "Meets expectations consistently and with little prompting or support",
  2: "Approaches expectations but not consistently meeting them",
  1: "Area of concern",
};

export function average(nums: (number | null | undefined)[]): number | null {
  const v = nums.filter((n): n is number => typeof n === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function fmtAvg(n: number | null, digits = 2): string {
  return n === null ? "" : n.toFixed(digits);
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
}

/** Close-out recommendation: every expected indicator at or above the threshold in each of the last N observations. */
export function readyToAdvance(
  recent: { scores: Record<string, number | null> }[],
  expected: Set<string>,
  threshold: number,
  count: number,
): boolean {
  if (expected.size === 0 || recent.length < count) return false;
  return recent.slice(0, count).every((o) => [...expected].every((code) => (o.scores[code] ?? 0) >= threshold));
}
