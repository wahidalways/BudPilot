import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeBattery } from "../jieli/earbuds.ts";
import { atSwitchOn, byPressAndHold, caseChanged, cameOnAbove } from "./noise-switch.ts";

// battery bytes from the earbuds' 0xC2 pushes (bit 7 = charging), 2026-11-22
const bat = (l: number, r: number, c: number) => ({ left: decodeBattery(l), right: decodeBattery(r), case: decodeBattery(c) });

test("an earbud leaving or entering the case counts; a battery level change doesn't", () => {
  assert.equal(caseChanged(bat(0xda, 0xda, 0x35), bat(0x5a, 0x5a, 0x00)), true); // 16:21:50: both out of the case
  assert.equal(caseChanged(bat(0x5a, 0x5a, 0x00), bat(0x5a, 0x50, 0x00)), false); // 16:27:40: right 90 -> 80 %
  assert.equal(caseChanged(bat(0x5a, 0x5a, 0x00), bat(0x5a, 0x00, 0x00)), true); // right gone
});

test("a switch soon after power-up is the firmware's; later it's press and hold", () => {
  assert.equal(byPressAndHold(1, 0, 2_000), false); // 16:21:52, 2 s after leaving the case
  assert.equal(byPressAndHold(1, 0, 60_000), true); // 16:26:27, minutes later
  assert.equal(byPressAndHold(1, 1, 60_000), false); // only a level change: never press and hold
});

test("press and hold arrives at the stored strength; the firmware's own switch at another one", () => {
  assert.equal(byPressAndHold(1, 0, 60_000, 0x0666 / 0x4000, 0x0666 / 0x4000), true); // 16:43:59: the user's presses
  assert.equal(byPressAndHold(1, 0, 85_000, 1, 0x0666 / 0x4000), false); // 17:01:29: full strength, Low stored
  assert.equal(byPressAndHold(2, 0, 60_000, 1, 1), true); // Transparency has one strength
});

test("ANC always switches on at Low; a strength picked while it's on holds until it goes off", () => {
  const low = { mode: 1, ncLevel: 0.1, adaptive: false };
  const mid = { mode: 1, ncLevel: 0.5, adaptive: false };
  const adaptive = { mode: 1, ncLevel: 0.1, adaptive: true };
  assert.equal(atSwitchOn(mid, 1, 1, low), mid); // picked Mid while ANC is on: kept
  assert.equal(atSwitchOn(mid, 0, 1, low), low); // ANC just came on (firmware, after power-up): Low
  assert.equal(atSwitchOn(mid, 1, 0, low), low); // ANC went off: it comes back (a put-back) at Low
  assert.equal(atSwitchOn(adaptive, 2, 1, low), low);
  assert.equal(atSwitchOn(low, 0, 1, low), low);
  const off = { mode: 0, ncLevel: 0.5, adaptive: false };
  assert.equal(atSwitchOn(off, 1, 0, low), off); // Off is kept as Off
  assert.equal(cameOnAbove(0, 1, 1, 0.1), true); // 17:01:29: the firmware's ANC at full strength
  assert.equal(cameOnAbove(0, 1, 0x0666 / 0x4000, 0.1), false); // already Low
  assert.equal(cameOnAbove(1, 1, 1, 0.1), false); // ANC already on: a strength change, not a switch-on
  assert.equal(cameOnAbove(undefined, 1, 1, 0.1), false); // the first reading after connecting
});
