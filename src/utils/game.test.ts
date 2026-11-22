import assert from "node:assert/strict";
import { test } from "node:test";

import { GAME_EQ, gameEqSteps, latencyMs } from "./game.ts";

const preset = (mode: number) => [mode, mode, mode, mode, mode, mode, mode, mode, mode, mode];
const userCustom = [0, 0, 0, 0, 0, 3, 0, 1, 0, 0];

test("game EQ on: saves the user's EQ once and writes the game curve to Custom", () => {
  const on = gameEqSteps(true, undefined, { mode: 1, custom: userCustom }, 9, preset);
  assert.deepEqual(on, { writes: [[9, GAME_EQ]], saved: { mode: 1, custom: userCustom } });
  // reconnecting mid-game: keeps the original save, doesn't save the game curve over it
  const again = gameEqSteps(true, on.saved, { mode: 9, custom: GAME_EQ }, 9, preset);
  assert.deepEqual(again.saved, { mode: 1, custom: userCustom });
});

test("game EQ off: puts the user's Custom back, then their preset", () => {
  const off = gameEqSteps(false, { mode: 1, custom: userCustom }, { mode: 9, custom: GAME_EQ }, 9, preset);
  assert.deepEqual(off, { writes: [[9, userCustom], [1, preset(1)]] });
  // they were on Custom: just their Custom values
  assert.deepEqual(gameEqSteps(false, { mode: 9, custom: userCustom }, { mode: 9, custom: GAME_EQ }, 9, preset).writes, [[9, userCustom]]);
  // nothing saved: nothing to do
  assert.deepEqual(gameEqSteps(false, undefined, { mode: 0, custom: userCustom }, 9, preset), { writes: [] });
});

test("latency check takes the median and ignores guesses and misses", () => {
  assert.equal(latencyMs([300, 50, 320, 2000, 310, 290]), 310);
  assert.equal(latencyMs([300, 50, 2000]), undefined); // too few real taps
});
