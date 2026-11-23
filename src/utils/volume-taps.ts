/** The earbuds' volume taps change their own volume, and Windows never hears of it (its slider and pop-up stay put).
 * BudPilot watches the earbuds' volume and passes each tap on as Windows volume-key presses.
 *
 * It only reads; it never sets the earbuds' volume. An earlier version parked it at one step and treated every move
 * away as a tap, but Windows moves the earbuds' volume too: on 2026-11-22, setting Windows to 100 % made them read
 * 14 instead of 15 as the sound started, BudPilot pressed volume-down, and 100 % became 92 %. So a change counts as
 * a tap only when nothing else explains it (see the quiet times below). */
const KEYS_PER_STEP = 3; // a Windows volume key moves 2 %; one of the earbuds' ~16 steps is about 6 %

/** After a noise-mode change or connecting, the earbuds play a voice prompt at their own volume 10 for 1-2 s. */
export const PROMPT_MS = 3000;
/** After sound starts or Windows' volume moves (BudPilot's own key presses included), Windows may hand the earbuds
 * its volume; they settle within a second. */
export const SETTLE_MS = 2000;

/** The Windows volume-key presses for the earbuds' volume going from `before` to `now` outside the quiet times:
 * a step is a tap (two if quick); a bigger jump isn't one (0). */
export const tapKeys = (before: number, now: number) => (Math.abs(now - before) <= 2 ? (now - before) * KEYS_PER_STEP : 0);
