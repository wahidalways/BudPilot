// Sample earbuds for Expo Go, which has no Bluetooth: a fake link that answers Shono like a real HOCO EQ35 ANC, from
// bytes captured on one on 2026-11-22, and keeps what it's told (noise mode, EQ, touch keys, Game mode, wear detection),
// so every screen works without a build. The tests use the same captured bytes.
import { jlAuthResponse } from "./auth.ts";
import type { Transport } from "./client.ts";
import { encodeFrame, FLAG_COMMAND, OP, parseTlvs, tlv } from "./rcsp.ts";

const fromHex = (s: string) => Uint8Array.from(s.replace(/\s+/g, "").match(/../g)!.map((b) => parseInt(b, 16)));

/** 0xC1 reply captured from a real HOCO EQ35 ANC (in its case, charging) on 2026-11-22. */
export const CAPTURED_SETTINGS = fromHex(`04 00 e4 e4 5e 0e 01 48 4f 43 4f 20 45 51 33 35 20 41 4e 43 13 02 01 01 05 02 01 05 01 02 04 02 02 04
  01 03 03 02 03 03 05 0a 00 00 00 07 02 04 01 02 05 01 07 06 05 d6 80 c0 e0 12`);
/** 0x07 reply from the same earbuds: noise mode, stored gains, EQ and its presets. */
export const CAPTURED_SYSINFO = fromHex(`ff 02 00 64 02 01 0c 0c 04 09 00 00 00 00 00 03 00 01 00 00 84 0c 0a 00 1e 00 3c 00 59 00 8c 00 ec 01 7c
  0a 05 13 f9 22 c2 03 5c 00 f6 04 06 fe f9 fc 03 fe fd 04 01 fb 04 03 fa 03 fd 01 02 f9 fd 02 f6 03 05 fd f8 fb 03 ff 00 03
  03 f6 ff 02 fc f9 00 03 ff f9 03 04 00 00 00 04 04 04 00 02 03 04 05 fe 00 00 02 02 00 00 00 04 04 06 00 00 00 00 00 00 00
  00 00 00 07 00 00 00 00 00 00 00 00 00 00 08 00 00 00 00 00 00 00 00 00 00 09 00 00 00 00 00 03 00 01 00 00 0a 0d 00 00 00
  00 00 00 00 00 00 1d 0e 03 00 00 00 00 00 00 00 00 00 01 40 00 40 00 40 00 40 00 02 40 00 40 00 40 00 40 00`);

const WEAR = [0xff, 0xfd, 0xf6];
const SETTING_BATTERY = 0;
const SETTING_KEYS = 2;
const SETTING_WORK_MODE = 5;

/** A pair of sample earbuds: out of the case at 82 % and 76 %, the case charging at 54 %. */
export function sampleTransport(): Transport {
  const settings = Uint8Array.from(CAPTURED_SETTINGS);
  const at: Record<number, number> = {}; // setting type -> offset of its value
  for (let i = 0; i + 1 < settings.length; i += 1 + settings[i]) at[settings[i + 1]] = i + 2;
  settings.set([82, 76, 0x80 | 54], at[SETTING_BATTERY]);
  const sys = parseTlvs(CAPTURED_SYSINFO.subarray(1)); // attribute -> value, updated by what Shono sets
  let wear = 2; // 2 on, 1 off

  let send: (b: Uint8Array) => void = () => {};
  const push = (op: number, data: number[]) => send(encodeFrame(FLAG_COMMAND, op, [0, ...data]));
  const answer = (op: number, data: Uint8Array): Iterable<number> => {
    if (op === OP.getSettings) return settings;
    if (op === OP.getSysInfo) return [0xff, ...[...sys].flatMap(([attr, v]) => tlv(attr, [...v]))];
    if (op === OP.setSysInfo) {
      for (const [attr, v] of parseTlvs(data.subarray(1))) sys.set(attr, Uint8Array.from(v));
      return [];
    }
    if (op === OP.custom) {
      if (WEAR.every((b, i) => data[i] === b)) {
        if (data[3] === 1 || data[3] === 2) wear = data[3];
        setTimeout(() => push(OP.custom, [...WEAR, wear]), 30); // the earbuds report it as a push
      }
      return [];
    }
    if (op !== OP.setSettings) return [];
    const [, type, a, b, c] = data;
    if (type === SETTING_WORK_MODE) settings[at[SETTING_WORK_MODE]] = a; // 1 normal, 2 game
    if (type === SETTING_KEYS) {
      if (settings[at[SETTING_WORK_MODE]] === 2) return [1]; // refused in game mode, like the real ones
      for (let i = at[SETTING_KEYS]; i + 2 < at[SETTING_KEYS] + settings[at[SETTING_KEYS] - 2] - 1; i += 3)
        if (settings[i] === a && settings[i + 1] === b) settings[i + 2] = c;
    }
    return [0];
  };

  // the handshake (each side proves it knows the key), then one reply per command
  const challenge = fromHex("00112233445566778899aabbccddeeff");
  let stage = 0;
  const reply = (b: Uint8Array) => {
    if (stage === 0) send(Uint8Array.from([0x01, ...jlAuthResponse(b.subarray(1))]));
    else if (stage === 1) send(Uint8Array.from([0x00, ...challenge]));
    else if (stage === 2) send(fromHex("0270617373")); // 02 "pass"
    else {
      const [op, sn] = [b[4], b[7]];
      send(encodeFrame(0, op, [0, sn, ...answer(op, b.subarray(8, b.length - 1))]));
    }
    stage++;
  };
  return {
    name: "Sample earbuds",
    write: async (b) => void setTimeout(() => reply(b), 12), // a little Bluetooth-like delay
    onData: (cb) => (send = cb),
    onDisconnect: () => {},
    close: async () => {},
  };
}
