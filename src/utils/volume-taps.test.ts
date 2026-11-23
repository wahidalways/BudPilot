import assert from "node:assert/strict";
import { test } from "node:test";

import { readVolume, tapKeys, type TapWatch } from "./volume-taps.ts";

test("a tap step becomes Windows volume keys; a bigger jump doesn't", () => {
  assert.equal(tapKeys(15, 16), 3);
  assert.equal(tapKeys(9, 7), -6); // two quick Volume Down taps
  assert.equal(tapKeys(15, 10), 0); // 17:12:20: a voice prompt playing
  assert.equal(tapKeys(12, 12), 0);
});

/** Feeds readings [ms, volume, quiet?] in order, also looking again when asked to; returns the presses with times. */
function run(readings: [number, number, boolean?][]) {
  let w: TapWatch = {};
  const pressed: [number, number][] = [];
  const look = (t: number, v: number, quiet = false) => {
    const r = readVolume(w, v, t, quiet);
    w = r.w;
    if (r.presses) pressed.push([t, r.presses]);
    return r;
  };
  let last = 0;
  readings.forEach(([t, v, quiet], i) => {
    const r = look(t, v, quiet);
    last = v;
    const next = readings[i + 1]?.[0] ?? Infinity;
    if (r.checkAt !== undefined && r.checkAt < next) look(r.checkAt, last);
  });
  return pressed;
}

test("a tap that holds is pressed once it has held", () => {
  assert.deepEqual(run([[0, 12], [5000, 13]]), [[6200, 3]]);
});

test("quick taps add up into one press", () => {
  assert.deepEqual(run([[0, 12], [5000, 13], [5600, 14]]), [[6800, 6]]);
});

test("a voice prompt's dip to 10 and back is never pressed (11:51:33, outside a quiet time)", () => {
  assert.deepEqual(run([[0, 12], [5000, 10], [6500, 12]]), []);
});

test("a change in a quiet time becomes the new base: Windows' echo of its own volume isn't pressed again (11:26)", () => {
  assert.deepEqual(run([[0, 15], [5000, 14, true], [9000, 14]]), []);
});

test("a real tap landing on 10 is still pressed, just later", () => {
  assert.deepEqual(run([[0, 11], [5000, 10]]), [[9000, -3]]);
});
