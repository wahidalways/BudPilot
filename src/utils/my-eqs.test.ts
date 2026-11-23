import assert from "node:assert/strict";
import { test } from "node:test";

import { type MyEq, nameProblem, playingEq } from "./my-eqs.ts";

const movies: MyEq = { id: "a", name: "Movies", gains: [2, 2, 1, 0, 0, 0, 1, 2, 2, 1] };
const talk: MyEq = { id: "b", name: "Podcasts", gains: [-3, -2, -1, 0, 2, 3, 3, 1, 0, -1] };

test("the saved EQ playing is the one whose curve the Custom slot reports", () => {
  assert.equal(playingEq([movies, talk], true, [...talk.gains])?.id, "b");
  assert.equal(playingEq([movies, talk], true, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), undefined); // an unsaved curve
  assert.equal(playingEq([movies, talk], false, [...movies.gains]), undefined); // a preset plays, not Custom
});

test("of two saved EQs with one curve (a + New copy), the one picked is playing", () => {
  const copy: MyEq = { id: "c", name: "My EQ 3", gains: [...movies.gains] };
  assert.equal(playingEq([movies, copy], true, [...movies.gains], "c")?.id, "c");
  assert.equal(playingEq([movies, copy], true, [...movies.gains], "a")?.id, "a");
  assert.equal(playingEq([movies, copy], true, [...movies.gains], "b")?.id, "a"); // picked one plays another curve
  assert.equal(playingEq([movies, copy], true, [...movies.gains])?.id, "a");
});

test("names must be there, short and not already used (any case)", () => {
  const taken = ["Normal", "Custom"];
  assert.equal(nameProblem("  ", [movies], taken), "Give it a name");
  assert.match(nameProblem("A very long name for an EQ", [movies], taken)!, /Keep it to/);
  assert.match(nameProblem("movies", [movies], taken)!, /already used/);
  assert.match(nameProblem("normal", [movies], taken)!, /already used/);
  assert.equal(nameProblem("Movies", [movies], taken, "a"), undefined); // renaming it to itself
  assert.equal(nameProblem(" Night ", [movies], taken), undefined);
});
