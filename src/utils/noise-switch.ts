import type { EarbudsState } from "../jieli/earbuds.ts";

/** The earbuds' firmware switches noise mode by itself only just after an earbud powers up (it boots when it leaves
 * the case, or when Shono finds it freshly on); seen 1-4.5 s after. Any other mode change is press and hold. */
export const FIRMWARE_SWITCH_MS = 10_000;

/** An earbud came out of or went into the case: its charging flag flipped, or it appeared or vanished. A battery
 * level change alone doesn't count. */
export const caseChanged = (a: EarbudsState["battery"], b: EarbudsState["battery"]) =>
  (["left", "right"] as const).some((k) => (a[k] === null) !== (b[k] === null) || a[k]?.charging !== b[k]?.charging);

/** The user switched mode with press and hold (keep it), rather than the firmware by itself (undo it). Press and
 * hold arrives at the strength the earbuds have stored for that mode (`stored`); the firmware's own switch came at
 * full strength while Low was stored (17:01:29), or just after powering up. */
export const byPressAndHold = (reported: number, chosen: number, msSincePowerUp: number, level?: number, stored?: number) =>
  reported !== chosen &&
  msSincePowerUp > FIRMWARE_SWITCH_MS &&
  (level === undefined || stored === undefined || Math.abs(level - stored) <= 0.02);

type Choice = { mode: number; ncLevel: number; adaptive: boolean };

/** ANC switching on starts at Low, whoever switches it (BudPilot, press and hold, the firmware) and whether or not
 * the noise setting is kept (the user, 2026-11-23: "ANC must be low"). So the kept choice drops back to `low` when ANC
 * comes on (`prevAnc` another mode) or is off and about to be put back; a strength picked while ANC stays on holds. */
export function atSwitchOn<C extends Choice>(p: C, prevAnc: number | undefined, anc: number, low: C): C {
  if (p.mode !== 1 || (!p.adaptive && Math.abs(p.ncLevel - low.ncLevel) <= 0.02)) return p;
  return anc !== 1 || (prevAnc !== undefined && prevAnc !== 1) ? low : p;
}

/** ANC just came on, at a strength other than `low`: switch it to Low even when the noise setting isn't kept. */
export const cameOnAbove = (prevAnc: number | undefined, anc: number, level: number | undefined, low: number) =>
  anc === 1 && prevAnc !== undefined && prevAnc !== 1 && level !== undefined && Math.abs(level - low) > 0.02;
