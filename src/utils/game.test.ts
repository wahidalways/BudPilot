import assert from "node:assert/strict";
import { test } from "node:test";

import { GAME_EQ, gameEqSteps, gameTarget, latencyMs, readGameEq } from "./game.ts";

const preset = (mode: number) => [mode, mode, mode, mode, mode, mode, mode, mode, mode, mode];
const userCustom = [0, 0, 0, 0, 0, 3, 0, 1, 0, 0];

test("game EQ on: saves the user's EQ once and writes the game curve to Custom", () => {
  const footsteps = { mode: 9, gains: GAME_EQ };
  const on = gameEqSteps(footsteps, undefined, { mode: 1, custom: userCustom }, 9, preset);
  assert.deepEqual(on, { writes: [[9, GAME_EQ]], saved: { mode: 1, custom: userCustom } });
  // reconnecting mid-game: keeps the original save, doesn't save the game curve over it
  const again = gameEqSteps(footsteps, on.saved, { mode: 9, custom: GAME_EQ }, 9, preset);
  assert.deepEqual(again.saved, { mode: 1, custom: userCustom });
});

test("game EQ off: puts the user's Custom back, then their preset", () => {
  const off = gameEqSteps(undefined, { mode: 1, custom: userCustom }, { mode: 9, custom: GAME_EQ }, 9, preset);
  assert.deepEqual(off, { writes: [[9, userCustom], [1, preset(1)]] });
  // they were on Custom: just their Custom values
  assert.deepEqual(gameEqSteps(undefined, { mode: 9, custom: userCustom }, { mode: 9, custom: GAME_EQ }, 9, preset).writes, [[9, userCustom]]);
  // nothing saved: nothing to do
  assert.deepEqual(gameEqSteps(undefined, undefined, { mode: 0, custom: userCustom }, 9, preset), { writes: [] });
});

test("latency check takes the median and ignores guesses and misses", () => {
  assert.equal(latencyMs([300, 50, 320, 2000, 310, 290]), 310);
  assert.equal(latencyMs([300, 50, 2000]), undefined); // too few real taps
});

test("Game mode's EQ choice: the built-in Game EQ, a preset, a saved EQ (gone: none), and the old on/off switch", () => {
  const mine = [{ id: "m", gains: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }];
  assert.deepEqual(gameTarget({ kind: "builtin" }, mine, 9, preset), { mode: 9, gains: GAME_EQ });
  assert.deepEqual(gameTarget({ kind: "preset", mode: 1 }, mine, 9, preset), { mode: 1, gains: preset(1) });
  assert.deepEqual(gameTarget({ kind: "mine", id: "m" }, mine, 9, preset), { mode: 9, gains: mine[0].gains });
  assert.equal(gameTarget({ kind: "mine", id: "deleted" }, mine, 9, preset), undefined);
  assert.equal(gameTarget(undefined, mine, 9, preset), undefined);
  assert.deepEqual(readGameEq(true), { kind: "builtin" });
  assert.deepEqual(readGameEq({ kind: "footsteps" }), { kind: "builtin" }); // its old name
  assert.equal(readGameEq(false), undefined);
  assert.deepEqual(readGameEq({ kind: "mine", id: "m" }), { kind: "mine", id: "m" });
});

test("a preset as the game EQ, then off: the user's own EQ comes back", () => {
  const on = gameEqSteps({ mode: 1, gains: preset(1) }, undefined, { mode: 9, custom: userCustom }, 9, preset);
  assert.deepEqual(on, { writes: [[1, preset(1)]], saved: { mode: 9, custom: userCustom } });
  assert.deepEqual(gameEqSteps(undefined, on.saved, { mode: 1, custom: userCustom }, 9, preset).writes, [[9, userCustom]]);
});
