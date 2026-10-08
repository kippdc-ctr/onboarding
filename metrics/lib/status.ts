// Goal status rules (spec section 7). Pure functions: no database access, so they are easy to test.
// Imports use explicit .ts extensions so `node --test` can run them directly.

export type GoalStatus = "met" | "close" | "off_track" | "not_yet" | "no_data";
export type Change = "up" | "down" | "same" | "new";

export const STATUS_LABEL: Record<GoalStatus, string> = {
  met: "Met",
  close: "Close",
  off_track: "Off track",
  not_yet: "Not yet measured",
  no_data: "No data",
};

export type GoalLike = {
  unit: "percent" | "count";
  direction: "at_least" | "at_most";
  target_value: number;
  measured_at: string | null; // null = rolling (latest period wins)
  pace_by: "cycle" | "sprint" | null;
  baseline_value: number | null;
};

export type PeriodLike = { key: string; kind: string; opens_on: string; closes_on: string; sort_order: number };

export type MeasurementLike = { period: string; numerator: number; denominator: number | null; data_through: string };

export type Thresholds = { closePoints: number; noChangePoints: number };

/** Percent for percent goals (null when the denominator is 0 or missing); the raw count for count goals. */
export function valueOf(unit: "percent" | "count", m: Pick<MeasurementLike, "numerator" | "denominator">): number | null {
  if (unit === "count") return Number(m.numerator);
  if (!m.denominator || Number(m.denominator) <= 0) return null;
  return (Number(m.numerator) / Number(m.denominator)) * 100;
}

export function compare(direction: "at_least" | "at_most", value: number, target: number, closePoints: number, unit: "percent" | "count"): GoalStatus {
  const gap = direction === "at_least" ? target - value : value - target; // > 0 means short of target
  if (gap <= 1e-9) return "met";
  // "Close" is a percentage-point rule; it does not apply to counts.
  if (unit === "percent" && gap <= closePoints + 1e-9) return "close";
  return "off_track";
}

export type Evaluation = {
  status: GoalStatus;
  /** The measurement the status is based on (null when not yet measured / no data). */
  current: MeasurementLike | null;
  value: number | null;
  /** Latest measurement in another period before the goal's own window opens (shown without a status). */
  interim: MeasurementLike | null;
  change: Change;
  /** Pace for inputs: expected-to-date given the calendar. */
  pace: { expected: number; actual: number; periodsDone: number; periodsTotal: number } | null;
  windowOpens: string | null;
};

/**
 * Status for one goal. `measurements` are the goal's overall ("all") rows for the school year.
 * `today` is an ISO date (YYYY-MM-DD).
 */
export function evaluate(goal: GoalLike, measurements: MeasurementLike[], periods: PeriodLike[], today: string, t: Thresholds): Evaluation {
  const order = new Map(periods.map((p) => [p.key, p.sort_order]));
  const byPeriod = [...measurements].sort((a, b) => (order.get(a.period) ?? 999) - (order.get(b.period) ?? 999) || a.data_through.localeCompare(b.data_through));
  const latest = byPeriod.at(-1) ?? null;

  let current: MeasurementLike | null = null;
  let interim: MeasurementLike | null = null;
  let windowOpens: string | null = null;

  if (goal.measured_at) {
    const p = periods.find((x) => x.key === goal.measured_at);
    windowOpens = p?.opens_on ?? null;
    current = measurements.find((m) => m.period === goal.measured_at) ?? null;
    if (!current) interim = latest;
  } else {
    // Rolling goals (each cycle / each sprint): the window opens with the first period of that kind.
    const kind = goal.pace_by ?? "cycle";
    const first = periods.filter((p) => p.kind === kind).sort((a, b) => a.sort_order - b.sort_order)[0];
    windowOpens = first?.opens_on ?? null;
    current = latest;
  }

  const base: Omit<Evaluation, "status"> = { current, value: null, interim, change: "new", pace: null, windowOpens };
  if (!current) {
    const open = windowOpens !== null && windowOpens <= today;
    return { ...base, status: open ? "no_data" : "not_yet" };
  }

  // Paced counts (one touchpoint per sprint) are entered one period at a time, so the value is the running total.
  const pacedCount = !!goal.pace_by && goal.unit === "count";
  const value = pacedCount ? measurements.reduce((s, m) => s + Number(m.numerator), 0) : valueOf(goal.unit, current);
  if (value === null) return { ...base, status: "no_data" };

  // Inputs paced against the calendar: before the year's periods are all done, compare to expected-to-date.
  let pace: Evaluation["pace"] = null;
  let status: GoalStatus;
  if (pacedCount) {
    const ofKind = periods.filter((p) => p.kind === goal.pace_by);
    const done = ofKind.filter((p) => p.closes_on < today).length;
    const expected = Math.min(goal.target_value, done);
    pace = { expected, actual: value, periodsDone: done, periodsTotal: ofKind.length };
    status = done >= ofKind.length ? compare(goal.direction, value, goal.target_value, t.closePoints, goal.unit) : value >= expected ? "met" : "off_track";
  } else {
    status = compare(goal.direction, value, goal.target_value, t.closePoints, goal.unit);
  }

  return { ...base, status, value, pace, change: changeVs(goal, value, t.noChangePoints) };
}

export function changeVs(goal: Pick<GoalLike, "baseline_value" | "direction">, value: number | null, noChangePoints: number): Change {
  if (goal.baseline_value === null || goal.baseline_value === undefined || value === null) return "new";
  const d = value - Number(goal.baseline_value);
  if (Math.abs(d) <= noChangePoints + 1e-9) return "same";
  return d > 0 ? "up" : "down";
}

export function formatValue(unit: "percent" | "count", value: number | null): string {
  if (value === null) return "—";
  if (unit === "count") return String(Math.round(value * 100) / 100);
  return `${Math.round(value)}%`;
}

export function formatTarget(g: Pick<GoalLike, "unit" | "direction" | "target_value">): string {
  if (g.unit === "count") return g.direction === "at_most" ? `${Number(g.target_value)} or fewer` : `${Number(g.target_value)}`;
  return `${Number(g.target_value)}%`;
}
