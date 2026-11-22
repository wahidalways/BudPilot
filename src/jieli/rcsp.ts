// JieLi RCSP framing: FE DC BA | flags | opcode | length (u16 BE, payload only) | payload | EF

export const FLAG_COMMAND = 0x80;
export const FLAG_WANTS_REPLY = 0x40;

export const OP = {
  getSysInfo: 0x07,
  setSysInfo: 0x08,
  sysInfoChanged: 0x09,
  setSettings: 0xc0,
  getSettings: 0xc1,
  advChanged: 0xc2,
  custom: 0xff,
} as const;

/** Custom (0xFF) payloads BudPilot may send, by prefix; vendors use 0xFF/0xF0 for things like factory reset. */
export const ALLOWED_CUSTOM = [
  [0xff, 0xfd, 0xf6], // Hoco wear detection: + 00 query, 01 off, 02 on (hoco.music WearTestBean)
];

// Firmware update, flash, file system, connection reset and custom (factory reset) opcodes.
export const BLOCKED_OPS = new Set([
  0x06, 0x0b, 0x1a, 0xd6, 0xf0, 0xff,
  ...Array.from({ length: 0x29 - 0x1b }, (_, i) => 0x1b + i),
  ...Array.from({ length: 0xea - 0xe1 }, (_, i) => 0xe1 + i),
]);

export type Frame = { flags: number; op: number; payload: Uint8Array };

export function encodeFrame(flags: number, op: number, payload: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  out.set([0xfe, 0xdc, 0xba, flags, op, payload.length >> 8, payload.length & 0xff]);
  out.set(payload, 7);
  out[out.length - 1] = 0xef;
  return out;
}

/** Joins notification chunks into whole frames; a frame may span chunks and a chunk may hold several. */
export class FrameReader {
  private buf: number[] = [];

  push(chunk: Uint8Array): Frame[] {
    this.buf.push(...chunk);
    const frames: Frame[] = [];
    for (;;) {
      const i = this.buf.findIndex((b, j) => b === 0xfe && this.buf[j + 1] === 0xdc && this.buf[j + 2] === 0xba);
      if (i < 0) {
        this.buf = this.buf.slice(-2); // keep a prefix split across chunks
        return frames;
      }
      this.buf = this.buf.slice(i);
      if (this.buf.length < 7) return frames;
      const end = 8 + ((this.buf[5] << 8) | this.buf[6]);
      if (this.buf.length < end) return frames;
      const f = this.buf.slice(0, end);
      this.buf = this.buf.slice(end);
      if (f[end - 1] === 0xef) frames.push({ flags: f[3], op: f[4], payload: Uint8Array.from(f.slice(7, -1)) });
    }
  }
}

/** Parses [length][type][value...] records, where length counts type + value. */
export function parseTlvs(b: Uint8Array): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  for (let i = 0; i < b.length; ) {
    const n = b[i];
    if (n === 0 || i + 1 + n > b.length) break;
    out.set(b[i + 1], b.subarray(i + 2, i + 1 + n));
    i += 1 + n;
  }
  return out;
}

export const tlv = (type: number, value: number[]) => [value.length + 1, type, ...value];
