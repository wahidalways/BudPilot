import type { EarbudsState } from "../jieli/earbuds.ts";

/** The earbuds' firmware switches noise mode by itself only just after an earbud powers up (it boots when it leaves
 * the case, or when BudPilot finds it freshly on); seen 1-4.5 s after. Any other mode change is press and hold. */
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
