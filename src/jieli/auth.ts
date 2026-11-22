// JieLi RCSP handshake: Bluetooth legacy E1 (SAFER+) with JieLi's fixed key and address.
// Verified against a real HOCO EQ35 ANC challenge/response (auth.test.ts).

const EXP: number[] = [];
for (let i = 0, v = 1; i < 256; i++, v = (v * 45) % 257) EXP.push(v % 256); // 45^128 = 256 -> 0
const LOG: number[] = [];
EXP.forEach((v, i) => (LOG[v] = i));

const XP = new Set([0, 3, 4, 7, 8, 11, 12, 15]); // byte positions that XOR; the others add
const PERM = [8, 11, 12, 15, 2, 1, 6, 5, 10, 9, 14, 13, 0, 7, 4, 3]; // Armenian shuffle
const OFFSET = [233, 229, 223, 193, 179, 167, 149, 131];

const JL_KEY = [0x06, 0x77, 0x5f, 0x87, 0x91, 0x8d, 0xd4, 0x23, 0x00, 0x5d, 0xf1, 0xd8, 0xcf, 0x0c, 0x14, 0x2b];
const JL_ADDR = [0x11, 0x22, 0x33, 0x33, 0x22, 0x11];

const mix = (x: number[], k: number[], xorFirst: boolean) =>
  x.map((a, i) => (XP.has(i) === xorFirst ? a ^ k[i] : (a + k[i]) & 255));

function subkeys(key: number[]) {
  let reg = [...key, key.reduce((a, b) => a ^ b, 0)];
  const ks = [[...key]];
  for (let p = 2; p <= 17; p++) {
    reg = reg.map((b) => ((b << 3) | (b >> 5)) & 255);
    ks.push(Array.from({ length: 16 }, (_, i) => (reg[(p - 1 + i) % 17] + EXP[EXP[(17 * p + i + 1) % 256]]) & 255));
  }
  return ks;
}

function ar(key: number[], input: number[], prime: boolean) {
  const ks = subkeys(key);
  let x = [...input];
  for (let r = 0; r < 8; r++) {
    if (prime && r === 2) x = mix(x, input, true); // A'r folds the round-1 input into round 3
    x = mix(x, ks[2 * r], true);
    x = x.map((b, i) => (XP.has(i) ? EXP[b] : LOG[b]));
    x = mix(x, ks[2 * r + 1], false);
    for (let lvl = 0; lvl < 4; lvl++) {
      for (let j = 0; j < 16; j += 2) {
        const a = x[j], b = x[j + 1];
        x[j] = (2 * a + b) & 255;
        x[j + 1] = (a + b) & 255;
      }
      if (lvl < 3) x = PERM.map((p) => x[p]);
    }
  }
  return mix(x, ks[16], true);
}

function e1(key: number[], rand: number[], addr: number[]) {
  const a = ar(key, rand, false);
  const y = a.map((v, i) => ((v ^ rand[i]) + addr[i % addr.length]) & 255);
  const kt = key.map((b, i) => ((i < 8) === (i % 2 === 0) ? (b + OFFSET[i % 8]) & 255 : b ^ OFFSET[i % 8]));
  return ar(kt, y, true);
}

/** Answer a 16-byte JieLi auth challenge. */
export function jlAuthResponse(challenge: Uint8Array): Uint8Array {
  if (challenge.length !== 16) throw new Error(`auth challenge must be 16 bytes, got ${challenge.length}`);
  return Uint8Array.from(e1(JL_KEY, [...challenge], JL_ADDR));
}
