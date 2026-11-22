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
  assert.equal(e.state.ancLevel, 1); // stored 0x4000 of max 0x4000
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0d 04 ff 0a 0d 02 40 00 40 00 40 00 40 00 ef"));

  await e.setEq(9, [-5, 0, 0, 0, 0, 3, 0, 1, 0, 5]);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0f 05 ff 0c 04 09 fb 00 00 00 00 03 00 01 00 05 ef"));
  assert.deepEqual(e.state.eqPresets.find((p) => p.mode === 9)?.gains, [-5, 0, 0, 0, 0, 3, 0, 1, 0, 5]);

  await e.setKey(1, 3, 4);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 c0 00 06 06 04 02 01 03 04 ef"));
  assert.deepEqual(e.state.keys.find((k) => k.ear === 1 && k.taps === 3), { ear: 1, taps: 3, fn: 4 });

  // the same bytes hoco.music sends (WearTestBean "FFFDF60%s", 2 = on)
  await e.setWearDetection(true);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 ff 00 05 07 ff fd f6 02 ef"));
  assert.equal(e.state.wearDetection, true);

  // Mid noise cancelling: current = 0.5 of max 0x4000 (the earbuds read this back exactly)
  await e.setAnc(1, 0.5);
  assert.deepEqual(written.at(-1), hex("fe dc ba c0 08 00 0d 08 ff 0a 0d 01 40 00 40 00 20 00 20 00 ef"));
  assert.equal(e.state.ancLevel, 0.5);
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

test("sets the noise-mode list right after the handshake, before reading anything", async () => {
  const { t, written } = fakeEarbuds();
  await Earbuds.open(t, () => {}, noiseModeMask([0]));
  // written[0..2] are the handshake; then Off only (bit 0 = 1), in the format hoco.music uses
  assert.deepEqual(written[3], hex("fe dc ba c0 c0 00 07 01 05 0a 00 00 00 01 ef"));
});
