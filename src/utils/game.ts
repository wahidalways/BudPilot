// Game mode extras that BudPilot adds on top of the earbuds' low-latency mode.

/** BudPilot's own "Footsteps" curve (30 Hz…16 kHz, within Hoco's ±5): less low boom that masks small sounds,
 * more 2–8 kHz where footsteps, reloads and voices sit. */
export const GAME_EQ = [-3, -3, -2, -1, 0, 1, 3, 4, 3, 1];

export type SavedEq = { mode: number; custom: number[] };

/** EQ writes ([mode, gains]) for the game EQ going on or off, and the user's EQ to keep while it's on.
 * The game curve lives in the Custom slot, so the user's Custom values are saved first and put back after. */
export function gameEqSteps(
  wanted: boolean,
  saved: SavedEq | undefined,
  current: SavedEq,
  customMode: number,
  presetGains: (mode: number) => number[],
): { writes: [number, number[]][]; saved?: SavedEq } {
  if (wanted) return { writes: [[customMode, GAME_EQ]], saved: saved ?? current };
  if (!saved) return { writes: [] };
  const writes: [number, number[]][] = [[customMode, saved.custom]];
  if (saved.mode !== customMode) writes.push([saved.mode, presetGains(saved.mode)]);
  return { writes };
}

/** Typical tap delay (ms) from a latency-check run: the median, ignoring guesses (<80 ms) and misses (>1.5 s). */
export function latencyMs(samples: number[]): number | undefined {
  const ok = samples.filter((s) => s >= 80 && s <= 1500).sort((a, b) => a - b);
  return ok.length >= 3 ? ok[Math.floor(ok.length / 2)] : undefined;
}
