import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calendarTier, cycleForDate, expectedIndicators, readyToAdvance, standingAt, type RulesConfig } from "./rules.ts";

const seed = JSON.parse(readFileSync(new URL("../content/seed.json", import.meta.url), "utf8"));
const cfg: RulesConfig = { cycles: seed.cycles, indicators: seed.indicators, tiers: seed.tiers, tracks: seed.tracks };
const none = { tracks: [], overrides: [], cycleOverrides: [] };

test("dates inside a cycle count toward it", () => {
  assert.equal(cycleForDate("2026-08-10", cfg.cycles), 1);
  assert.equal(cycleForDate("2026-10-08", cfg.cycles), 2);
  assert.equal(cycleForDate("2026-07-20", cfg.cycles), 0);
});

test("dates between cycles count toward the cycle that most recently ended", () => {
  assert.equal(cycleForDate("2026-10-03", cfg.cycles), 1);
  assert.equal(cycleForDate("2026-11-25", cfg.cycles), 2);
  assert.equal(cycleForDate("2027-06-15", cfg.cycles), 5);
});

test("Standard residents follow each indicator's first-scored cycle", () => {
  assert.deepEqual([...expectedIndicators("2026-07-20", cfg, none)], []);
  assert.deepEqual([...expectedIndicators("2026-09-01", cfg, none)], ["CC.A.4", "CC.A.5", "CC.A.6"]);
  assert.deepEqual([...expectedIndicators("2026-10-05", cfg, none)], ["CC.A.4", "CC.A.5", "CC.A.6", "CC.A.7", "CK.P.1", "CK.A.4"]);
  assert.equal(expectedIndicators("2026-12-01", cfg, none).size, 10);
  assert.ok(!expectedIndicators("2027-04-01", cfg, none).has("CC.P.3"), "CC.P.3 is never scored");
});

test("Developing residents stay on their tier while the calendar moves on", () => {
  const rules = { ...none, tracks: [{ track: "developing", tier: 1, effective_from: "2026-10-01" }] };
  assert.deepEqual([...expectedIndicators("2026-12-01", cfg, rules)], ["CC.A.4", "CC.A.5", "CC.A.6"]);
  assert.equal(standingAt("2026-12-01", cfg, rules).tier, 1);
  // Before the track change took effect, the calendar applied.
  assert.equal(expectedIndicators("2026-09-15", cfg, rules).size, 3);
});

test("Accelerated residents get later indicators early; changes can be backdated", () => {
  const rules = { ...none, tracks: [{ track: "accelerated", tier: 3, effective_from: "2026-09-01" }] };
  assert.equal(expectedIndicators("2026-09-15", cfg, rules).size, 10);
  const back = { ...none, tracks: [...rules.tracks, { track: "standard", tier: null, effective_from: "2026-09-10", created_at: "z" }] };
  assert.equal(expectedIndicators("2026-09-15", cfg, back).size, 3);
});

test("per-resident overrides turn single indicators on or off", () => {
  const rules = { ...none, overrides: [{ indicator: "CK.P.1", mode: "on" as const, effective_from: "2026-09-01" }, { indicator: "CC.A.6", mode: "off" as const, effective_from: "2026-09-01" }] };
  assert.deepEqual([...expectedIndicators("2026-09-15", cfg, rules)].sort(), ["CC.A.4", "CC.A.5", "CK.P.1"]);
});

test("a custom cycle calendar moves a resident's dates", () => {
  const rules = { ...none, cycleOverrides: [{ cycle: 2, start_date: "2026-09-14", end_date: "2026-11-20" }] };
  assert.ok(expectedIndicators("2026-09-20", cfg, rules).has("CC.A.7"));
  assert.equal(calendarTier("2026-09-20", cfg.tiers, cfg.cycles), 1);
});

test("advance recommendation needs every expected indicator at threshold in the last N observations", () => {
  const exp = new Set(["CC.A.4", "CC.A.5"]);
  const good = { scores: { "CC.A.4": 3, "CC.A.5": 4 } };
  const weak = { scores: { "CC.A.4": 3, "CC.A.5": 2 } };
  assert.equal(readyToAdvance([good, good, weak], exp, 3, 2), true);
  assert.equal(readyToAdvance([good, weak], exp, 3, 2), false);
  assert.equal(readyToAdvance([good], exp, 3, 2), false);
});
