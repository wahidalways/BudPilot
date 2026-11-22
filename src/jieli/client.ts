import { jlAuthResponse } from "./auth.ts";
import { BLOCKED_OPS, encodeFrame, FLAG_COMMAND, FLAG_WANTS_REPLY, FrameReader } from "./rcsp.ts";

/** A connected BLE link to the earbuds' AE01 (write) / AE02 (notify) characteristics. */
export interface Transport {
  name: string;
  write(bytes: Uint8Array): Promise<void>;
  onData(cb: (bytes: Uint8Array) => void): void;
  onDisconnect(cb: () => void): void;
  close(): Promise<void>;
}

type Pending = { resolve: (data: Uint8Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; op: number };

const PASS = [0x02, 0x70, 0x61, 0x73, 0x73]; // 02 "pass"
const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
const same = (a: Uint8Array, b: ArrayLike<number>) => a.length === b.length && a.every((v, i) => v === b[i]);

export class RcspClient {
  onPush: (op: number, data: Uint8Array) => void = () => {};
  private t: Transport;
  private reader = new FrameReader();
  private sn = 0;
  private pending = new Map<number, Pending>();
  private rawWaiter?: (b: Uint8Array) => void;

  constructor(t: Transport) {
    this.t = t;
    t.onData((b) => this.handle(b));
  }

  /** Mutual JieLi auth: we challenge the earbuds, then they challenge us. */
  async handshake() {
    const rand = Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)); // the scheme has a fixed key, so no CSPRNG needed
    const answer = await this.exchange([0x00, ...rand]);
    if (!same(answer, [0x01, ...jlAuthResponse(rand)])) throw new Error("These earbuds did not pass the JieLi handshake.");
    const challenge = await this.exchange(PASS);
    if (challenge[0] !== 0x00 || challenge.length !== 17) throw new Error("The earbuds sent an unexpected handshake message.");
    const verdict = await this.exchange([0x01, ...jlAuthResponse(challenge.subarray(1))]);
    if (!same(verdict, PASS)) throw new Error("The earbuds rejected the handshake.");
  }

  /** Sends a command and resolves with the reply data (after status and sn). */
  request(op: number, data: number[], ms = 3000): Promise<Uint8Array> {
    if (BLOCKED_OPS.has(op)) return Promise.reject(new Error(`Command ${hex(op)} is blocked: it can change firmware or reset the earbuds.`));
    const sn = (this.sn = (this.sn + 1) & 0xff);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(sn);
        reject(new Error(`The earbuds did not answer command ${hex(op)}.`));
      }, ms);
      this.pending.set(sn, { resolve, reject, timer, op });
      this.t.write(encodeFrame(FLAG_COMMAND | FLAG_WANTS_REPLY, op, [sn, ...data])).catch((e) => {
        clearTimeout(timer);
        this.pending.delete(sn);
        reject(e);
      });
    });
  }

  private exchange(bytes: number[], ms = 5000): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rawWaiter = undefined;
        reject(new Error("The earbuds did not answer the handshake."));
      }, ms);
      this.rawWaiter = (b) => {
        clearTimeout(timer);
        resolve(b);
      };
      this.t.write(Uint8Array.from(bytes)).catch(reject);
    });
  }

  private handle(bytes: Uint8Array) {
    const waiter = this.rawWaiter;
    if (waiter) {
      this.rawWaiter = undefined;
      waiter(bytes);
      return;
    }
    for (const f of this.reader.push(bytes)) {
      if (f.flags & FLAG_COMMAND) {
        const sn = f.payload[0];
        if (f.flags & FLAG_WANTS_REPLY) void this.t.write(encodeFrame(0, f.op, [0, sn])).catch(() => {});
        this.onPush(f.op, f.payload.subarray(1));
        continue;
      }
      const [status, sn] = f.payload;
      const p = this.pending.get(sn);
      if (!p) continue;
      clearTimeout(p.timer);
      this.pending.delete(sn);
      if (status === 0) p.resolve(f.payload.subarray(2));
      else p.reject(new Error(`The earbuds refused command ${hex(p.op)} (status ${status}).`));
    }
  }
}
