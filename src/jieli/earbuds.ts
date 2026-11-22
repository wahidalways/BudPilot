import { RcspClient, type Transport } from "./client.ts";
import { OP, parseTlvs, tlv } from "./rcsp.ts";

export type Battery = { percent: number; charging: boolean } | null;
export type EqPreset = { mode: number; gains: number[] };
export type EarbudsState = {
  name: string;
  battery: { left: Battery; right: Battery; case: Battery };
  /** 0 off, 1 noise cancelling, 2 transparency */
  anc: number;
  /** Stored gain bytes per noise mode; the earbuds expect them back when switching. */
  ancGains: Record<number, number[]>;
  eqMode: number;
  eqPresets: EqPreset[];
  gameMode: boolean;
};

const ATTR = { eq: 4, eqPresets: 12, anc: 13, ancAll: 14 } as const;
const SETTING = { battery: 0, name: 1, workMode: 5 } as const;
const SYS_MASK = (1 << ATTR.eq) | (1 << ATTR.eqPresets) | (1 << ATTR.anc) | (1 << ATTR.ancAll);

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const s8 = (b: number) => (b << 24) >> 24;

/** Bit 7 = charging, low 7 bits = percent, 0 = not there (e.g. a bud outside the case's reach). */
export const decodeBattery = (b: number): Battery => (b ? { percent: b & 0x7f, charging: (b & 0x80) !== 0 } : null);
const batteries = (b: ArrayLike<number>) => ({ left: decodeBattery(b[0]), right: decodeBattery(b[1]), case: decodeBattery(b[2]) });

/** Decodes a 0xC1 reply: setting TLVs. */
export function decodeSettings(data: Uint8Array): Partial<EarbudsState> {
  const t = parseTlvs(data);
  const out: Partial<EarbudsState> = {};
  const bat = t.get(SETTING.battery);
  const name = t.get(SETTING.name);
  const mode = t.get(SETTING.workMode);
  if (bat?.length === 3) out.battery = batteries(bat);
  if (name) out.name = new TextDecoder().decode(name);
  if (mode) out.gameMode = mode[0] === 2;
  return out;
}

/** Decodes a 0x07 reply or a 0x09 push: FF (common function) + attribute TLVs. */
export function decodeSysInfo(data: Uint8Array): Partial<EarbudsState> {
  if (data[0] !== 0xff) return {};
  const t = parseTlvs(data.subarray(1));
  const out: Partial<EarbudsState> = {};
  const anc = t.get(ATTR.anc);
  const ancAll = t.get(ATTR.ancAll);
  const eq = t.get(ATTR.eq);
  const presets = t.get(ATTR.eqPresets);
  if (anc) out.anc = anc[0];
  if (ancAll) {
    out.ancGains = {};
    for (let i = 0, off = 1; i < ancAll[0] && off + 9 <= ancAll.length; i++, off += 9) {
      out.ancGains[ancAll[off]] = [...ancAll.subarray(off + 1, off + 9)];
    }
  }
  if (eq) out.eqMode = eq[0];
  if (presets) {
    // band count n, n band frequencies (u16 BE), then [mode, n gains] per preset
    const n = presets[0];
    out.eqPresets = [];
    for (let off = 1 + 2 * n; off + 1 + n <= presets.length; off += 1 + n) {
      out.eqPresets.push({ mode: presets[off], gains: [...presets.subarray(off + 1, off + 1 + n)].map(s8) });
    }
  }
  return out;
}

export class Earbuds {
  state: EarbudsState;
  private t: Transport;
  private client: RcspClient;
  private onChange: (s: EarbudsState) => void;

  private constructor(t: Transport, onChange: (s: EarbudsState) => void) {
    this.t = t;
    this.onChange = onChange;
    this.state = { name: t.name, battery: { left: null, right: null, case: null }, anc: 0, ancGains: {}, eqMode: 0, eqPresets: [], gameMode: false };
    this.client = new RcspClient(t);
    this.client.onPush = (op, data) => {
      if (op === OP.sysInfoChanged) this.update(decodeSysInfo(data));
      else if (op === OP.advChanged && data.length >= 17) this.update({ battery: batteries(data.subarray(14, 17)) });
    };
  }

  /** Handshake, then read everything the screen shows. */
  static async open(t: Transport, onChange: (s: EarbudsState) => void): Promise<Earbuds> {
    const e = new Earbuds(t, onChange);
    await e.client.handshake();
    const settings = decodeSettings(await e.client.request(OP.getSettings, u32(0xffffffff)));
    const sys = decodeSysInfo(await e.client.request(OP.getSysInfo, [0xff, ...u32(SYS_MASK)]));
    e.state = { ...e.state, ...settings, ...sys };
    return e;
  }

  async setAnc(mode: number) {
    const gains = this.state.ancGains[mode];
    if (!gains) throw new Error("These earbuds don't offer that noise mode.");
    await this.client.request(OP.setSysInfo, [0xff, ...tlv(ATTR.anc, [mode, ...gains])]);
    this.update({ anc: mode });
  }

  async setEqPreset(p: EqPreset) {
    await this.client.request(OP.setSysInfo, [0xff, ...tlv(ATTR.eq, [p.mode, ...p.gains.map((g) => g & 255)])]);
    this.update({ eqMode: p.mode });
  }

  async setGameMode(on: boolean) {
    await this.client.request(OP.setSettings, tlv(SETTING.workMode, [on ? 2 : 1]));
    this.update({ gameMode: on });
  }

  close() {
    return this.t.close();
  }

  private update(p: Partial<EarbudsState>) {
    this.state = { ...this.state, ...p };
    this.onChange(this.state);
  }
}
