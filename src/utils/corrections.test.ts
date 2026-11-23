import assert from "node:assert/strict";
import { test } from "node:test";

import { addCorrection, type Correction, seconds, today } from "./corrections.ts";

const at = (h: number, m: number, day = 22) => new Date(2026, 10, day, h, m).getTime();
const c = (when: number, ms: number): Correction => ({ at: when, from: 1, to: 0, ms });

test("today counts only corrections since local midnight, and finds the quickest", () => {
  const list = [c(at(13, 45), 130), c(at(9, 2), 240), c(at(23, 50, 21), 90)];
  assert.deepEqual(today(list, at(14, 0)), { count: 2, fastestMs: 130 });
});

test("today is empty before the first correction", () => {
  assert.deepEqual(today([c(at(23, 50, 21), 90)], at(8, 0)), { count: 0, fastestMs: undefined });
});

test("addCorrection puts the newest first and keeps the list short", () => {
  let list: Correction[] = [];
  for (let i = 0; i < 60; i++) list = addCorrection(list, c(i, i));
  assert.equal(list.length, 50);
  assert.equal(list[0].at, 59);
});

test("seconds shows two decimals", () => {
  assert.equal(seconds(124), "0.12 s");
  assert.equal(seconds(2400), "2.40 s");
});
