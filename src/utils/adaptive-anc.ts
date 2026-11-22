// Adaptive noise cancelling, done by BudPilot: the earbuds have no adaptive mode, so the app picks Low / Mid / High
// from how loud the room is (a computer microphone's level, in dBFS).

/** Room levels (dBFS) between Low|Mid and Mid|High. shortcut: uncalibrated for any one mic; tune here if it reacts oddly. */
export const ROOM_DB = [-50, -38];
/** How far past a boundary the room must go before the strength changes, so it doesn't flicker at the edge. */
export const DEAD_ZONE_DB = 3;
/** Minimum time between two automatic changes. */
export const MIN_HOLD_MS = 10_000;

/** Strength index (0 Low, 1 Mid, 2 High) for a room level, staying at `current` inside the dead zone. */
export function pickStrength(db: number, current: number): number {
  const target = db < ROOM_DB[0] ? 0 : db < ROOM_DB[1] ? 1 : 2;
  if (target === current) return current;
  const edge = target > current ? ROOM_DB[current] : ROOM_DB[current - 1]; // the boundary next to `current`
  return Math.abs(db - edge) >= DEAD_ZONE_DB ? target : current;
}

/** Index of the level closest to `level` (e.g. the earbuds' stored 1.0 reads as High). */
export const nearestIndex = (level: number, levels: number[]) =>
  levels.reduce((best, l, i) => (Math.abs(l - level) < Math.abs(levels[best] - level) ? i : best), 0);

export const roomWord = (db: number) => (db < ROOM_DB[0] ? "quiet" : db < ROOM_DB[1] ? "some noise" : "loud");
