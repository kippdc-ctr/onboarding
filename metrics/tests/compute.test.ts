import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMeasurements, gapCount, subsetMembers, suppressed, type Member } from "../lib/compute.ts";

function member(met: boolean, r: Partial<Member["resident"]> = {}, counted = true): Member {
  return { met, counted, resident: { campus: "Shaw", school: null, grade_band: "Elementary", group_label: null, race_ethnicity: null, gender: null, ...r } };
}

test("overall and breakdown counts only include counted members", () => {
  const rows = computeMeasurements([member(true), member(false, { campus: "Webb" }), member(true, {}, false)]);
  assert.deepEqual(rows.find((r) => r.breakdown_type === "all"), { breakdown_type: "all", breakdown_value: "", numerator: 1, denominator: 2 });
  assert.deepEqual(rows.filter((r) => r.breakdown_type === "campus").map((r) => [r.breakdown_value, r.numerator, r.denominator]), [
    ["Shaw", 1, 1],
    ["Webb", 0, 1],
  ]);
  assert.equal(rows.filter((r) => r.breakdown_type === "school").length, 0, "blank values are skipped");
});

test("subset rule matches demographics case-insensitively by prefix", () => {
  const ms = [
    member(true, { race_ethnicity: "Black or African American", gender: "Male" }),
    member(false, { race_ethnicity: "black", gender: "male" }),
    member(true, { race_ethnicity: "Black", gender: "Female" }),
  ];
  assert.equal(subsetMembers(ms, { race_ethnicity: "black", gender: "male" }).length, 2);
});

test("gap rule counts groups of 5+ more than 10 points below overall", () => {
  const ms: Member[] = [];
  for (let i = 0; i < 10; i++) ms.push(member(true, { race_ethnicity: "A", gender: i < 5 ? "Female" : "Male" }));
  for (let i = 0; i < 6; i++) ms.push(member(i < 2, { race_ethnicity: "B", gender: "Female" }));
  for (let i = 0; i < 3; i++) ms.push(member(false, { race_ethnicity: "C", gender: "Male" })); // n < 5: not evaluated
  const r = gapCount(ms, { from: 31, kind: "gap", points: 10, by: ["race_ethnicity", "gender"] }, 5);
  // overall 12/19 = 63%; A 100%, B 33% (below), Female 7/11 = 64%, Male 5/8 = 63%
  assert.deepEqual(r.below, ["B"]);
  assert.equal(r.denominator, 4);
});

test("small-n suppression hides groups under the threshold except for the owner", () => {
  assert.equal(suppressed(4, { suppressSmallN: true, isOwner: false, smallN: 5 }), true);
  assert.equal(suppressed(5, { suppressSmallN: true, isOwner: false, smallN: 5 }), false);
  assert.equal(suppressed(4, { suppressSmallN: true, isOwner: true, smallN: 5 }), false);
  assert.equal(suppressed(4, { suppressSmallN: false, isOwner: false, smallN: 5 }), false);
});
