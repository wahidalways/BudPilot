/** The earbuds' volume taps change their own volume, and Windows never hears of it (its slider and pop-up stay put).
 * Shono watches the earbuds' volume and passes each tap on as Windows volume-key presses.
 *
 * Telling a tap from everything else that moves the earbuds' volume is the hard part (2026-11-23, user: "the music
 * gets lower or higher by itself"):
 * - voice prompts play at the earbuds' volume 10, then it goes back: 11:51:33 a prompt took 12 to 10, and its return
 *   to 12 came 3.3 s after the mode change, past the old 3 s quiet time, so Shono pressed Volume Up ×6;
 * - Windows hands its own volume to the earbuds while sound plays, so Shono's presses came back as a step in the
 *   earbuds' volume ~2.4 s later, past the old 2 s quiet time, and were pressed again: 11:26 Windows went
 *   92 → 85 → 78 → 72 % with nobody touching the earbuds.
 * So a change is pressed only once it has held (a prompt dips and comes back), and never in a quiet time. */
const KEYS_PER_STEP = 3; // a Windows volume key moves 2 %; one of the earbuds' ~16 steps is about 6 %
const PROMPT_VOLUME = 10; // the earbuds' voice prompts play at their own volume 10

/** After a noise-mode change or connecting: a voice prompt (its return was seen 3.3 s after the change). */
export const QUIET_PROMPT_MS = 5000;
/** After Windows' volume moves (Shono's own presses too): Windows hands it to the earbuds (seen ~2.4 s later). */
export const QUIET_ECHO_MS = 4000;
/** After sound starts or stops: Windows may hand the earbuds its volume. */
export const QUIET_PLAY_MS = 2500;
/** A new volume must hold this long to count as a tap; on the prompt volume longer, as an unannounced prompt (an
 * earbud joining, the case) dips there and comes back. */
const HOLD_MS = 1200;
const HOLD_PROMPT_MS = 4000;
const hold = (v: number) => (v === PROMPT_VOLUME ? HOLD_PROMPT_MS : HOLD_MS);

/** The Windows volume-key presses for the earbuds' volume going from `before` to `now`: a step is a tap (two if
 * quick); a bigger jump isn't one (0). */
export const tapKeys = (before: number, now: number) => (Math.abs(now - before) <= 2 ? (now - before) * KEYS_PER_STEP : 0);

/** `base`: the earbuds' volume Windows is in step with; `pending`: a change still to hold. */
export type TapWatch = { base?: number; pending?: { value: number; since: number } };

/** One look at the earbuds' volume. Returns the new watch, the keys to press now, when to look again (a pending
 * change), and a line for the log when a would-be tap was pressed or dropped. `quiet`: a quiet time, or the bridge is
 * off: the volume is taken as it is. */
export function readVolume(w: TapWatch, v: number, now: number, quiet: boolean): { w: TapWatch; presses: number; checkAt?: number; note?: string } {
  if (w.base === undefined || quiet) return { w: { base: v }, presses: 0 };
  const { base, pending } = w;
  if (v === base) return { w: { base }, presses: 0, note: pending && `volume ${base} → ${pending.value} → ${base}: came back, not a tap` };
  if (pending?.value !== v) return { w: { base, pending: { value: v, since: now } }, presses: 0, checkAt: now + hold(v) };
  if (now - pending.since < hold(v)) return { w, presses: 0, checkAt: pending.since + hold(v) };
  const presses = tapKeys(base, v);
  return { w: { base: v }, presses, note: presses ? undefined : `volume ${base} → ${v}: too big a jump for a tap` };
}
