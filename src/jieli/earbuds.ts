import { RcspClient, type Transport } from "./client.ts";
import { OP, parseTlvs, tlv } from "./rcsp.ts";

export type Battery = { percent: number; charging: boolean } | null;
export type EqPreset = { mode: number; gains: number[] };
/** One touch gesture: ear 1 = left, 2 = right; taps 1-3; fn = function code (model-specific names). */
export type KeyBinding = { ear: number; taps: number; fn: number };
export type EarbudsState = {
  name: string;
  battery: { left: Battery; right: Battery; case: Battery };
  /** 0 off, 1 noise cancelling, 2 transparency */
  anc: number;
  /** Stored gain bytes per noise mode: max L, max R, current L, current R (u16 BE); the earbuds expect them back. */
  ancGains: Record<number, number[]>;
  /** Strength of the current noise mode, as a share (0-1) of the earbuds' maximum; undefined when off. */
  ancLevel?: number;
  eqMode: number;
  eqGains: number[];
  eqPresets: EqPreset[];
  keys: KeyBinding[];
  gameMode: boolean;
  /** Hoco wear detection; undefined until the earbuds report it (other models may not have it). */
  wearDetection?: boolean;
  /** The earbuds' own volume step: their volume taps change it, and Windows hands them its volume while sound plays. */
  volume?: number;
  /** Sound is streaming to the earbuds (they announce it starting, and stopping a few seconds after a pause). */
  playing?: boolean;
};

// Hoco firmware custom command (hoco.music WearTestBean): FF FD F6 + 00 query / 01 off / 02 on.
const WEAR = [0xff, 0xfd, 0xf6];
/** Decodes Hoco's wear-detection status, pushed as custom data FF FD F6 01 (off) / 02 (on). */
export const decodeWear = (data: Uint8Array): boolean | undefined =>
  WEAR.every((b, i) => data[i] === b) && (data[3] === 1 || data[3] === 2) ? data[3] === 2 : undefined;

const ATTR = { volume: 1, eq: 4, eqPresets: 12, anc: 13, ancAll: 14 } as const;
const SETTING = { battery: 0, name: 1, keys: 2, workMode: 5, noiseModeList: 10 } as const;
/** Result codes of a settings change (0xC0), from JieLi's SDK (JL_TwsManager.h, kJL_MANAGER_HEADSET_SET_ERR). */
const SET_REFUSED_IN_GAME_MODE = 1;
const SET_ERRORS: Record<number, string> = {
  1: "The earbuds won't take that change in Game mode. Turn Game mode off and try again.",
  2: "That name is too long for the earbuds.",
  3: "The earbuds can't change that right now.",
};

/** Noise-mode list bitmask (ADV type 10, hoco.music setSelectVoiceModeList): bit n = mode n allowed. */
export const noiseModeMask = (modes: number[]) => modes.reduce((m, n) => m | (1 << n), 0);
const SYS_MASK = (1 << ATTR.volume) | (1 << ATTR.eq) | (1 << ATTR.eqPresets) | (1 << ATTR.anc) | (1 << ATTR.ancAll);
const REFRESH_MASK = (1 << ATTR.volume) | (1 << ATTR.eq) | (1 << ATTR.anc);

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const s8 = (b: number) => (b << 24) >> 24;
const u16 = (b: ArrayLike<number>, i: number) => (b[i] << 8) | b[i + 1];
/** current L / max L from noise gain bytes [maxL, maxR, curL, curR]. */
const ancLevelOf = (g: ArrayLike<number>) => (g.length >= 8 && u16(g, 0) ? u16(g, 4) / u16(g, 0) : undefined);

/** The strength the earbuds have stored for a noise mode (what press and hold switches to), as a share of max. */
export const storedAncLevel = (s: EarbudsState, mode: number) => (s.ancGains[mode] ? ancLevelOf(s.ancGains[mode]) : undefined);

/** `s` with EQ mode `mode` playing `gains` (for the Custom slot, also what it stores). */
export const withEq = (s: EarbudsState, mode: number, gains: number[]): EarbudsState => ({
  ...s,
  eqMode: mode,
  eqGains: gains,
  eqPresets: s.eqPresets.map((p) => (p.mode === mode ? { mode, gains } : p)),
});

/** Bit 7 = charging, low 7 bits = percent, 0 = not there (e.g. a bud outside the case's reach). */
export const decodeBattery = (b: number): Battery => (b ? { percent: b & 0x7f, charging: (b & 0x80) !== 0 } : null);
const batteries = (b: ArrayLike<number>) => ({ left: decodeBattery(b[0]), right: decodeBattery(b[1]), case: decodeBattery(b[2]) });

/** Decodes a 0xC1 reply: setting TLVs. */
export function decodeSettings(data: Uint8Array): Partial<EarbudsState> {
  const t = parseTlvs(data);
  const out: Partial<EarbudsState> = {};
  const bat = t.get(SETTING.battery);
  const name = t.get(SETTING.name);
  const keys = t.get(SETTING.keys);
  const mode = t.get(SETTING.workMode);
  if (bat?.length === 3) out.battery = batteries(bat);
  if (name) out.name = new TextDecoder().decode(name);
  if (keys) {
    out.keys = [];
    for (let i = 0; i + 3 <= keys.length; i += 3) out.keys.push({ ear: keys[i], taps: keys[i + 1], fn: keys[i + 2] });
  }
  if (mode) out.gameMode = mode[0] === 2;
  return out;
}

/** Decodes a 0x07 reply or a 0x09 push: FF (common function) + attribute TLVs; or 00 (Bluetooth function), whose
 * attribute 7 says whether sound is streaming (pushed as 00 02 07 01 / 00, seen with Chrome playing and pausing). */
export function decodeSysInfo(data: Uint8Array): Partial<EarbudsState> {
  if (data[0] === 0x00) {
    const playing = parseTlvs(data.subarray(1)).get(7);
    return playing?.length ? { playing: playing[0] === 1 } : {};
  }
  if (data[0] !== 0xff) return {};
  const t = parseTlvs(data.subarray(1));
  const out: Partial<EarbudsState> = {};
  const anc = t.get(ATTR.anc);
  const ancAll = t.get(ATTR.ancAll);
  const eq = t.get(ATTR.eq);
  const presets = t.get(ATTR.eqPresets);
  const volume = t.get(ATTR.volume);
  if (volume?.length) out.volume = volume[0];
  if (anc) {
    out.anc = anc[0];
    out.ancLevel = anc[0] ? ancLevelOf(anc.subarray(1)) : undefined;
  }
  if (ancAll) {
    out.ancGains = {};
    for (let i = 0, off = 1; i < ancAll[0] && off + 9 <= ancAll.length; i++, off += 9) {
      out.ancGains[ancAll[off]] = [...ancAll.subarray(off + 1, off + 9)];
    }
  }
  if (eq) {
    out.eqMode = eq[0];
    out.eqGains = [...eq.subarray(1)].map(s8);
  }
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
  /** Last few unsolicited messages, for diagnosing model-specific features. */
  recentPushes: { at: string; op: number; data: string }[] = [];
  private t: Transport;
  private client: RcspClient;
  private onChange: (s: EarbudsState) => void;

  private constructor(t: Transport, onChange: (s: EarbudsState) => void) {
    this.t = t;
    this.onChange = onChange;
    this.state = {
      name: t.name,
      battery: { left: null, right: null, case: null },
      anc: 0,
      ancGains: {},
      eqMode: 0,
      eqGains: [],
      eqPresets: [],
      keys: [],
      gameMode: false,
    };
    this.client = new RcspClient(t);
    this.client.onPush = (op, data) => {
      const hex = [...data].map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const d = new Date();
      const at = `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
      this.recentPushes = [...this.recentPushes.slice(-19), { at, op, data: hex }];
      if (op === OP.sysInfoChanged) this.update(decodeSysInfo(data));
      else if (op === OP.advChanged && data.length >= 17) this.update({ battery: batteries(data.subarray(14, 17)) });
      else if (op === OP.custom) {
        const wear = decodeWear(data);
        if (wear !== undefined && wear !== this.state.wearDetection) this.update({ wearDetection: wear });
      }
    };
  }

  /** Handshake, then read everything the screen shows. */
  static async open(t: Transport, onChange: (s: EarbudsState) => void): Promise<Earbuds> {
    const e = new Earbuds(t, onChange);
    await e.client.handshake();
    const settings = decodeSettings(await e.client.request(OP.getSettings, u32(0xffffffff)));
    const sys = decodeSysInfo(await e.client.request(OP.getSysInfo, [0xff, ...u32(SYS_MASK)]));
    e.state = { ...e.state, ...settings, ...sys };
    await e.client.custom([...WEAR, 0x00]).catch(() => {}); // the answer arrives as a push; models without it just don't answer
    return e;
  }

  /** Re-reads what other apps or the earbud buttons can change; notifies only when something did. */
  async refresh() {
    const settings = decodeSettings(await this.client.request(OP.getSettings, u32(0xffffffff)));
    const sys = decodeSysInfo(await this.client.request(OP.getSysInfo, [0xff, ...u32(REFRESH_MASK)]));
    const next = { ...this.state, ...settings, ...sys };
    if (JSON.stringify(next) !== JSON.stringify(this.state)) this.update(next);
  }

  /** Switches noise mode; `level` (0-1 of the earbuds' maximum) sets its strength, otherwise the stored one is used. */
  async setAnc(mode: number, level?: number) {
    const stored = this.state.ancGains[mode];
    if (!stored) throw new Error("These earbuds don't offer that noise mode.");
    let gains = stored;
    if (level !== undefined && mode !== 0) {
      const l = Math.round(u16(stored, 0) * level);
      const r = Math.round(u16(stored, 2) * level);
      gains = [...stored.slice(0, 4), l >> 8, l & 255, r >> 8, r & 255];
    }
    await this.client.request(OP.setSysInfo, [0xff, ...tlv(ATTR.anc, [mode, ...gains])]);
    // the earbuds keep the new strength as that mode's stored one (seen in attr 14)
    this.update({ anc: mode, ancLevel: mode ? ancLevelOf(gains) : undefined, ancGains: { ...this.state.ancGains, [mode]: gains } });
  }

  /** Selects EQ mode `mode` with these gains (dB); for the custom mode this also stores them. */
  async setEq(mode: number, gains: number[]) {
    await this.client.request(OP.setSysInfo, [0xff, ...tlv(ATTR.eq, [mode, ...gains.map((g) => g & 255)])]);
    this.update(withEq(this.state, mode, gains));
  }

  /** Re-reads just the volume (cheap): the earbuds don't always announce a change from their volume taps. */
  async refreshVolume() {
    const { volume } = decodeSysInfo(await this.client.request(OP.getSysInfo, [0xff, ...u32(1 << ATTR.volume)]));
    if (volume !== undefined && volume !== this.state.volume) this.update({ volume });
  }

  /** Sets one touch gesture, and only reports success once the earbuds hold it. They answer every settings change
   * with a result code (JieLi SDK: 0 done, 1 refused in game mode); in game (low-latency) mode they refuse touch
   * changes, so Shono steps out of it for the change and straight back. */
  async setKey(ear: number, taps: number, fn: number) {
    const send = async () => (await this.client.request(OP.setSettings, tlv(SETTING.keys, [ear, taps, fn])))[0] ?? 0;
    let code = await send();
    if (code === SET_REFUSED_IN_GAME_MODE && this.state.gameMode) {
      await this.setGameMode(false);
      try {
        code = await send();
      } finally {
        await this.setGameMode(true);
      }
    }
    if (code !== 0) throw new Error(SET_ERRORS[code] ?? `The earbuds refused that change (code ${code}).`);
    // read back what the earbuds now hold: firmware can accept a change it doesn't support and ignore it
    const keys = decodeSettings(await this.client.request(OP.getSettings, u32(1 << SETTING.keys))).keys;
    if (keys) this.update({ keys });
    if (!keys?.some((k) => k.ear === ear && k.taps === taps && k.fn === fn)) throw new Error("The earbuds didn't take that change. Try again.");
  }

  /** The noise modes press and hold cycles through (JieLi ADV type 10, the anc_voice_key mask). */
  async setNoiseModes(mask: number) {
    await this.client.request(OP.setSettings, tlv(SETTING.noiseModeList, u32(mask)));
  }

  async setWearDetection(on: boolean) {
    await this.client.custom([...WEAR, on ? 2 : 1]);
    this.update({ wearDetection: on });
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
