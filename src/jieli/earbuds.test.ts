import assert from "node:assert/strict";
import { test } from "node:test";

import { jlAuthResponse } from "./auth.ts";
import type { Transport } from "./client.ts";
import { decodeSettings, decodeSysInfo, Earbuds } from "./earbuds.ts";
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
    gameMode: false,
  });
});

test("decodes real sys info: noise mode, stored gains, EQ presets", () => {
  const s = decodeSysInfo(SYSINFO);
  assert.equal(s.anc, 0);
  assert.deepEqual(s.ancGains?.[1], [0x40, 0, 0x40, 0, 0x40, 0, 0x40, 0]);
  assert.equal(s.eqMode, 9);
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

/** Plays the earbud side: answers the handshake, replies to commands with the captured data. */
function fakeEarbuds() {
  const written: Uint8Array[] = [];
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
      const frame = encodeFrame(0, op, [0, sn, ...(op === 0xc1 ? SETTINGS : op === 0x07 ? SYSINFO : [])]);
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
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0d 03 ff 0a 0d 02 40 00 40 00 40 00 40 00 ef"));
});
