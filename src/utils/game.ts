// Game mode extras that Shono adds on top of the earbuds' low-latency mode.

/** Shono's own gaming curve, "Game EQ" (30 Hz…16 kHz, within Hoco's ±5): less low boom that masks small sounds,
 * more 2–8 kHz where footsteps, reloads and voices sit. (Named "Footsteps" until the user asked for another name.) */
export const GAME_EQ = [-3, -3, -2, -1, 0, 1, 3, 4, 3, 1];
export const GAME_EQ_NAME = "Game EQ";

export type SavedEq = { mode: number; custom: number[] };

/** The EQ Game mode plays while its gaming EQ is on: the built-in Game EQ, one of Hoco's presets, or one of the
 * user's saved EQs. */
export type GameEq = { kind: "builtin" } | { kind: "preset"; mode: number } | { kind: "mine"; id: string };

/** A saved choice, also from older versions: a Footsteps switch (true) or { kind: "footsteps" }, both the built-in. */
export function readGameEq(raw: unknown): GameEq | undefined {
  if (raw === true) return { kind: "builtin" };
  if (!raw || typeof raw !== "object" || !("kind" in raw)) return undefined;
  return (raw as { kind: string }).kind === "footsteps" ? { kind: "builtin" } : (raw as GameEq);
}

/** What `choice` plays: an EQ mode and its gains (saved EQs and the built-in Game EQ go in the Custom slot). Undefined when it's
 * a saved EQ that's gone. */
export function gameTarget(
  choice: GameEq | undefined,
  mine: { id: string; gains: number[] }[],
  customMode: number,
  presetGains: (mode: number) => number[],
): { mode: number; gains: number[] } | undefined {
  if (!choice) return undefined;
  if (choice.kind === "builtin") return { mode: customMode, gains: GAME_EQ };
  if (choice.kind === "preset") return { mode: choice.mode, gains: presetGains(choice.mode) };
  const eq = mine.find((e) => e.id === choice.id);
  return eq && { mode: customMode, gains: eq.gains };
}

/** EQ writes ([mode, gains]) for the game EQ (`wanted`) going on, changing or off, and the user's EQ to keep while
 * it's on: their mode and Custom values are saved first and put back after. */
export function gameEqSteps(
  wanted: { mode: number; gains: number[] } | undefined,
  saved: SavedEq | undefined,
  current: SavedEq,
  customMode: number,
  presetGains: (mode: number) => number[],
): { writes: [number, number[]][]; saved?: SavedEq } {
  if (wanted) return { writes: [[wanted.mode, wanted.gains]], saved: saved ?? current };
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
