import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, changeVs, compare, formatTarget, type GoalLike, type PeriodLike } from "../lib/status.ts";

const periods: PeriodLike[] = [
  { key: "Sprint 1", kind: "sprint", opens_on: "2026-08-10", closes_on: "2026-09-25", sort_order: 0 },
  { key: "C1", kind: "cycle", opens_on: "2026-09-08", closes_on: "2026-10-16", sort_order: 1 },
  { key: "Sprint 2", kind: "sprint", opens_on: "2026-09-28", closes_on: "2026-11-13", sort_order: 2 },
  { key: "C2", kind: "cycle", opens_on: "2026-10-19", closes_on: "2026-12-04", sort_order: 3 },
  { key: "Eval 3", kind: "eval", opens_on: "2027-05-10", closes_on: "2027-05-28", sort_order: 4 },
];
const t = { closePoints: 5, noChangePoints: 1 };
const pct = (o: Partial<GoalLike> = {}): GoalLike => ({ unit: "percent", direction: "at_least", target_value: 90, measured_at: "Eval 3", pace_by: null, baseline_value: null, ...o });
const m = (period: string, numerator: number, denominator: number | null, data_through = "2026-10-01") => ({ period, numerator, denominator, data_through });

test("met / close / off track use the 5-point rule", () => {
  assert.equal(compare("at_least", 90, 90, 5, "percent"), "met");
  assert.equal(compare("at_least", 85, 90, 5, "percent"), "close");
  assert.equal(compare("at_least", 84.9, 90, 5, "percent"), "off_track");
  assert.equal(compare("at_most", 0, 0, 5, "count"), "met");
  assert.equal(compare("at_most", 1, 0, 5, "count"), "off_track");
});

test("fixed-period goal before its window opens is not yet measured, and shows interim data without a status", () => {
  const e = evaluate(pct(), [m("C1", 40, 50)], periods, "2026-10-08", t);
  assert.equal(e.status, "not_yet");
  assert.equal(e.interim?.period, "C1");
  assert.equal(e.current, null);
});

test("fixed-period goal with its window open but no data is no data", () => {
  assert.equal(evaluate(pct(), [], periods, "2027-05-12", t).status, "no_data");
});

test("fixed-period goal uses only its own period", () => {
  const e = evaluate(pct(), [m("C1", 10, 50), m("Eval 3", 45, 50)], periods, "2027-06-01", t);
  assert.equal(e.status, "met");
  assert.equal(e.value, 90);
});

test("rolling goal uses the latest period", () => {
  const g = pct({ measured_at: null });
  assert.equal(evaluate(g, [], periods, "2026-09-10", t).status, "no_data");
  assert.equal(evaluate(g, [], periods, "2026-09-01", t).status, "not_yet");
  const e = evaluate(g, [m("C2", 40, 50), m("C1", 50, 50)], periods, "2026-12-10", t);
  assert.equal(e.current?.period, "C2");
  assert.equal(e.status, "off_track");
});

test("paced count goal sums periods and compares to expected-to-date", () => {
  const g: GoalLike = { unit: "count", direction: "at_least", target_value: 6, measured_at: null, pace_by: "sprint", baseline_value: null };
  const one = evaluate(g, [m("Sprint 1", 1, 1)], periods, "2026-10-08", t);
  assert.equal(one.status, "met");
  assert.deepEqual(one.pace, { expected: 1, actual: 1, periodsDone: 1, periodsTotal: 2 });
  const missed = evaluate(g, [m("Sprint 1", 0, 1)], periods, "2026-10-08", t);
  assert.equal(missed.status, "off_track");
});

test("change arrow compares to baseline with a 1-point no-change band", () => {
  assert.equal(changeVs({ baseline_value: 70, direction: "at_least" }, 70.8, 1), "same");
  assert.equal(changeVs({ baseline_value: 70, direction: "at_least" }, 75, 1), "up");
  assert.equal(changeVs({ baseline_value: 70, direction: "at_least" }, 60, 1), "down");
  assert.equal(changeVs({ baseline_value: null, direction: "at_least" }, 60, 1), "new");
});

test("zero denominator is no data, not 0%", () => {
  assert.equal(evaluate(pct({ measured_at: null }), [m("C1", 0, 0)], periods, "2026-10-08", t).status, "no_data");
});

test("targets format by unit", () => {
  assert.equal(formatTarget({ unit: "percent", direction: "at_least", target_value: 90 }), "90%");
  assert.equal(formatTarget({ unit: "count", direction: "at_most", target_value: 0 }), "0 or fewer");
});
