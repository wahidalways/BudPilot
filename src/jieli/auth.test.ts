import assert from "node:assert/strict";
import { test } from "node:test";

import { jlAuthResponse } from "./auth.ts";

const hex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));

test("answers a challenge exactly like a real HOCO EQ35 ANC", () => {
  assert.deepEqual(jlAuthResponse(hex("ABB2CDC69BB454110E827441213DDC87")), hex("61721F97C869523CCCE093D7F849CA02"));
});

test("rejects a challenge of the wrong length", () => {
  assert.throws(() => jlAuthResponse(new Uint8Array(15)));
});
