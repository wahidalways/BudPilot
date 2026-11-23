import assert from "node:assert/strict";
import { test } from "node:test";

import { smoothPath } from "./eq-path.ts";

/** The y of every point the path names (anchors and control points). */
const ys = (d: string) => {
  const nums = d.replace(/[MC]/g, " ").trim().split(/\s+/).map(Number);
  return nums.filter((_, i) => i % 2 === 1);
};

test("a raised band next to flat ones never dips past the flat line", () => {
  // SVG y grows downward: 100 is the 0 dB line, 60 is a boost
  const d = smoothPath([[0, 100], [10, 60], [20, 100], [30, 100], [40, 100]]);
  assert.ok(ys(d).every((y) => y >= 60 && y <= 100), d);
});

test("flat stays flat", () => {
  const d = smoothPath([[0, 50], [10, 50], [20, 50]]);
  assert.ok(ys(d).every((y) => y === 50), d);
});

test("passes through every point", () => {
  const pts: [number, number][] = [[0, 10], [10, 30], [20, 5], [30, 25]];
  const d = smoothPath(pts);
  for (const [x, y] of pts) assert.ok(d.includes(`${x} ${y}`), `${x} ${y}`);
});
