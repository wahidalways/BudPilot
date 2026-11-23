import assert from "node:assert/strict";
import { test } from "node:test";

import { tapKeys } from "./volume-taps.ts";

test("a tap step becomes Windows volume keys; a bigger jump doesn't", () => {
  assert.equal(tapKeys(15, 16), 3);
  assert.equal(tapKeys(9, 7), -6); // two quick Volume Down taps
  assert.equal(tapKeys(15, 10), 0); // 17:12:20: a voice prompt playing
  assert.equal(tapKeys(12, 12), 0);
});
