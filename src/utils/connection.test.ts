import assert from "node:assert/strict";
import { test } from "node:test";

import { BG_READ_MS, holdsWhenSoundLeaves, READ_MS, readEvery, retryWait } from "./connection.ts";

test("reads come every 30 s in the background, but every 3 s once one went unanswered", () => {
  assert.equal(readEvery(false, 0), READ_MS);
  assert.equal(readEvery(true, 0), BG_READ_MS);
  assert.equal(readEvery(true, 1), READ_MS);
  // 4 misses close the link: about 4 × (3 s wait + 3 s reply timeout), not 4 × 30 s
  assert.ok(4 * (readEvery(true, 1) + 3000) <= 25_000);
});

test("failed automatic tries wait longer each time, never more than 20 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 30].map(retryWait), [1500, 3000, 6000, 12_000, 20_000, 20_000, 20_000]);
});

test("only a Connect made while the sound is elsewhere keeps the link when the sound leaves", () => {
  assert.equal(holdsWhenSoundLeaves(false, false), true);
  assert.equal(holdsWhenSoundLeaves(false, true), false); // the first run's Connect, with the earbuds playing here
  assert.equal(holdsWhenSoundLeaves(false, undefined), false); // not known yet (no Bluetooth access before the first run)
  assert.equal(holdsWhenSoundLeaves(true, false), false); // Shono's own tries always follow the sound
});
