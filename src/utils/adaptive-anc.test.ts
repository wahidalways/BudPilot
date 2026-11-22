import assert from "node:assert/strict";
import { test } from "node:test";

import { nearestIndex, pickStrength } from "./adaptive-anc.ts";

test("quiet, moderate and loud rooms map to Low, Mid, High", () => {
  assert.equal(pickStrength(-70, 1), 0);
  assert.equal(pickStrength(-44, 0), 1);
  assert.equal(pickStrength(-20, 1), 2);
});

test("stays put inside the dead zone around a boundary", () => {
  assert.equal(pickStrength(-49, 0), 0); // just above -50: not far enough to leave Low
  assert.equal(pickStrength(-46, 0), 1); // 4 dB past: moves to Mid
  assert.equal(pickStrength(-52, 1), 1); // just below -50: stays Mid
  assert.equal(pickStrength(-54, 1), 0);
  assert.equal(pickStrength(-36, 1), 1); // just above -38: stays Mid
  assert.equal(pickStrength(-30, 0), 2); // a big jump goes straight to High
});

test("the earbuds' stored strength reads as the closest choice", () => {
  assert.equal(nearestIndex(1, [0.1, 0.5, 0.9]), 2);
  assert.equal(nearestIndex(0.1, [0.1, 0.5, 0.9]), 0);
  assert.equal(nearestIndex(0.45, [0.1, 0.5, 0.9]), 1);
});
