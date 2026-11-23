import assert from "node:assert/strict";
import { test } from "node:test";

import { jlAuthResponse } from "./auth.ts";
import { RcspClient, type Transport } from "./client.ts";
import { decodeSettings, decodeSysInfo, decodeWear, Earbuds, noiseModeMask } from "./earbuds.ts";
import { encodeFrame, FrameReader } from "./rcsp.ts";

const hex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/\s+/g, ""), "hex"));

// Captured from a real HOCO EQ35 ANC (in its case, charging) on 2026-11-22.
const SETTINGS = hex(`04 00 e4 e4 5e 0e 01 48 4f 43 4f 20 45 51 33 35 20 41 4e 43 13 02 01 01 05 02 01 05 01 02 04 02 02 04
  01 03 03 02 03 03 05 0a 00 00 00 07 02 04 01 02 05 01 07 06 05 d6 80 c0 e0 12`);
const SYSINFO = hex(`ff 02 00 64 02 01 0c 0c 04 09 00 00 00 00 00 03 00 01 00 00 84 0c 0a 00 1e 00 3c 00 59 00 8c 00 ec 01 7c
  0a 05 13 f9 22 c2 03 5c 00 f6 04 06 fe f9 fc 03 fe fd 04 01 fb 04 03 fa 03 fd 01 02 f9 fd 02 f6 03 05 fd f8 fb 03 ff 00 03
  03 f6 ff 02 fc f9 00 03 ff f9 03 04 00 00 00 04 04 04 00 02 03 04 05 fe 00 00 02 02 00 00 00 04 04 06 00 00 00 00 00 00 00
  00 00 00 07 00 00 00 00 00 00 00 00 00 00 08 00 00 00 00 00 00 00 00 00 00 09 00 00 00 00 00 03 00 01 00 00 0a 0d 00 00 00
  00 00 00 00 00 00 1d 0e 03 00 00 00 00 00 00 00 00 00 01 40 00 40 00 40 00 40 00 02 40 00 40 00 40 00 40 00`);

test("decodes real settings: name, batteries, work mode", () => {
  assert.deepEqual(decodeSettings(SETTINGS), {
    name: "HOCO EQ35 ANC",
    battery: { left: { percent: 100, charging: true }, right: { percent: 100, charging: true }, case: { percent: 94, charging: false } },
    // Hoco's app shows the same: tap = Play/Pause (5), double = Next (4), three = Previous (3), both ears
    keys: [
      { ear: 1, taps: 1, fn: 5 },
      { ear: 2, taps: 1, fn: 5 },
      { ear: 1, taps: 2, fn: 4 },
      { ear: 2, taps: 2, fn: 4 },
      { ear: 1, taps: 3, fn: 3 },
      { ear: 2, taps: 3, fn: 3 },
    ],
    gameMode: false,
  });
});

test("decodes real sys info: noise mode, stored gains, EQ presets", () => {
  const s = decodeSysInfo(SYSINFO);
  assert.equal(s.anc, 0);
  assert.deepEqual(s.ancGains?.[1], [0x40, 0, 0x40, 0, 0x40, 0, 0x40, 0]);
  assert.equal(s.eqMode, 9);
  assert.deepEqual(s.eqGains, [0, 0, 0, 0, 0, 3, 0, 1, 0, 0]); // Hoco's Custom: 1K = 3, 4K = 1
  assert.equal(s.eqPresets?.length, 10);
  assert.deepEqual(s.eqPresets?.[9], { mode: 9, gains: [0, 0, 0, 0, 0, 3, 0, 1, 0, 0] });
  assert.equal(s.eqPresets?.[0].gains[0], -10);
});

test("frame reader joins split chunks and skips noise", () => {
  const a = encodeFrame(0, 0x08, [0, 1]);
  const b = encodeFrame(0x80, 0x09, [5, 0xff]);
  const r = new FrameReader();
  assert.deepEqual(r.push(Uint8Array.from([0x11, ...a.subarray(0, 4)])), []);
  const frames = r.push(Uint8Array.from([...a.subarray(4), ...b]));
  assert.deepEqual(frames.map((f) => f.op), [0x08, 0x09]);
});

/** Plays the earbud side: answers the handshake, then commands, keeping a settings table the way the real earbuds do:
 * a touch change sticks and reads back, except in game mode, where they refuse it with code 1 (JieLi SDK).
 * `ignoreTripleTap`: answer "done" to triple-tap changes but keep the old function (JieLi's reference firmware). */
function fakeEarbuds({ ignoreTripleTap = false } = {}) {
  const written: Uint8Array[] = [];
  const settings = Uint8Array.from(SETTINGS);
  const at: Record<number, number> = {}; // setting type -> offset of its value
  for (let i = 0; i + 1 < settings.length; i += 1 + settings[i]) at[settings[i + 1]] = i + 2;
  const answer = (op: number, data: Uint8Array): ArrayLike<number> => {
    if (op === 0xc1) return settings;
    if (op === 0x07) return SYSINFO;
    if (op !== 0xc0) return [];
    const [, type, ear, taps, fn] = data;
    if (type === 5) settings[at[5]] = ear; // work mode: 1 normal, 2 game
    if (type === 2) {
      if (settings[at[5]] === 2) return [1];
      if (ignoreTripleTap && taps === 3) return [0];
      for (let i = at[2]; i + 2 < at[2] + settings[at[2] - 2] - 1; i += 3) if (settings[i] === ear && settings[i + 1] === taps) settings[i + 2] = fn;
    }
    return [0];
  };
  const challenge = hex("00112233445566778899aabbccddeeff");
  let stage = 0;
  let send: (b: Uint8Array) => void = () => {};
  const reply = (b: Uint8Array) => {
    if (stage === 0) send(Uint8Array.from([0x01, ...jlAuthResponse(b.subarray(1))]));
    else if (stage === 1) send(Uint8Array.from([0x00, ...challenge]));
    else if (stage === 2) {
      assert.deepEqual(b, Uint8Array.from([0x01, ...jlAuthResponse(challenge)]));
      send(hex("0270617373"));
    } else {
      const [op, sn] = [b[4], b[7]];
      const frame = encodeFrame(0, op, [0, sn, ...answer(op, b.subarray(8, b.length - 1))]);
      send(frame.subarray(0, 20)); // BLE may split a reply across notifications
      send(frame.subarray(20));
    }
    stage++;
  };
  const t: Transport = {
    name: "fake",
    write: async (b) => {
      written.push(b);
      queueMicrotask(() => reply(b));
    },
    onData: (cb) => (send = cb),
    onDisconnect: () => {},
    close: async () => {},
  };
  return { t, written };
}

test("opens over a fake link, then switches to transparency with the stored gains", async () => {
  const { t, written } = fakeEarbuds();
  const e = await Earbuds.open(t, () => {});
  assert.equal(e.state.name, "HOCO EQ35 ANC");
  assert.equal(e.state.eqPresets.length, 10);
  await e.setAnc(2);
  assert.equal(e.state.anc, 2);
  assert.equal(e.state.ancLevel, 1); // stored 0x4000 of max 0x4000
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0d 04 ff 0a 0d 02 40 00 40 00 40 00 40 00 ef"));

  await e.setEq(9, [-5, 0, 0, 0, 0, 3, 0, 1, 0, 5]);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0f 05 ff 0c 04 09 fb 00 00 00 00 03 00 01 00 05 ef"));
  assert.deepEqual(e.state.eqPresets.find((p) => p.mode === 9)?.gains, [-5, 0, 0, 0, 0, 3, 0, 1, 0, 5]);

  await e.setKey(1, 3, 4);
  assert.deepEqual(written.at(-2), hex("fe dc ba c0 c0 00 06 06 04 02 01 03 04 ef"));
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 c1 00 05 07 00 00 00 04 ef")); // then reads the keys back
  assert.deepEqual(e.state.keys.find((k) => k.ear === 1 && k.taps === 3), { ear: 1, taps: 3, fn: 4 });

  // the same bytes hoco.music sends (WearTestBean "FFFDF60%s", 2 = on)
  await e.setWearDetection(true);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 ff 00 05 08 ff fd f6 02 ef"));
  assert.equal(e.state.wearDetection, true);

  // Mid noise cancelling: current = 0.5 of max 0x4000 (the earbuds read this back exactly)
  await e.setAnc(1, 0.5);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0d 09 ff 0a 0d 01 40 00 40 00 20 00 20 00 ef"));
  assert.equal(e.state.ancLevel, 0.5);
});

/** A written command as "op: data" in hex, without the frame around it. */
const cmd = (w: Uint8Array) => `${w[4].toString(16)}: ${[...w.subarray(8, w.length - 1)].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`;

test("in game mode the earbuds refuse touch changes: Shono steps out of it for the change, then back", async () => {
  const { t, written } = fakeEarbuds();
  const e = await Earbuds.open(t, () => {});
  await e.setGameMode(true);
  const before = written.length;
  await e.setKey(2, 2, 10); // right double tap: Volume Down
  assert.deepEqual(written.slice(before).map(cmd), [
    "c0: 04 02 02 02 0a", // refused (code 1)
    "c0: 02 05 01", // normal mode
    "c0: 04 02 02 02 0a", // taken
    "c0: 02 05 02", // game mode again
    "c1: 00 00 00 04", // read the keys back
  ]);
  assert.deepEqual(e.state.keys.find((k) => k.ear === 2 && k.taps === 2), { ear: 2, taps: 2, fn: 10 });
  assert.equal(e.state.gameMode, true);
});

test("a touch change the earbuds don't keep is reported, not shown as done", async () => {
  const { t } = fakeEarbuds({ ignoreTripleTap: true });
  const e = await Earbuds.open(t, () => {});
  await assert.rejects(e.setKey(1, 3, 4), /didn't take/);
  assert.deepEqual(e.state.keys.find((k) => k.ear === 1 && k.taps === 3), { ear: 1, taps: 3, fn: 3 }); // still what they hold
});

test("reads the earbuds' own volume (attr 1) and whether sound is streaming", () => {
  assert.equal(decodeSysInfo(hex("ff 02 01 0f")).volume, 15); // 2026-11-22
  assert.equal(decodeSysInfo(SYSINFO).volume, 12);
  assert.equal(decodeSysInfo(hex("00 02 07 01")).playing, true); // pushed when Chrome started playing
  assert.equal(decodeSysInfo(hex("00 02 07 00")).playing, false);
});

test("reads noise strength from the earbuds' report", () => {
  assert.equal(decodeSysInfo(hex("ff 0a 0d 01 40 00 40 00 06 66 06 66")).ancLevel, 0x0666 / 0x4000);
  assert.equal(decodeSysInfo(hex("ff 0a 0d 00 00 00 00 00 00 00 00 00")).ancLevel, undefined);
});

test("decodes Hoco's wear-detection status pushes", () => {
  assert.equal(decodeWear(hex("ff fd f6 02")), true);
  assert.equal(decodeWear(hex("ff fd f6 01")), false);
  assert.equal(decodeWear(hex("ff fd f6 07")), undefined);
  assert.equal(decodeWear(hex("00 02 07 01")), undefined);
});

test("refuses custom commands that aren't on the allow list", async () => {
  const { t } = fakeEarbuds();
  const c = new RcspClient(t);
  await assert.rejects(c.custom([0x0a, 0x01]), /allow list/);
  await assert.rejects(c.request(0xff, [0xff, 0xfd, 0xf6, 0x02]), /blocked/);
});

test("sets the press-and-hold list in the format hoco.music uses", async () => {
  const { t, written } = fakeEarbuds();
  const e = await Earbuds.open(t, () => {});
  await e.setNoiseModes(noiseModeMask([0, 1, 2]));
  assert.equal(cmd(written.at(-1)!), "c0: 05 0a 00 00 00 07");
});
