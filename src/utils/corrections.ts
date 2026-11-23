/** One time Shono put the noise setting back after the earbuds changed it by themselves. */
export type Correction = { at: number; from: number; to: number; ms: number };

const KEEP = 50; // enough for the log and today's count, small enough for local storage

export const addCorrection = (list: Correction[], c: Correction): Correction[] => [c, ...list].slice(0, KEEP);

/** Today's corrections (local midnight on): how many, and the quickest. */
export function today(list: Correction[], now = Date.now()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const todays = list.filter((c) => c.at >= midnight.getTime() && c.at <= now);
  return { count: todays.length, fastestMs: todays.length ? Math.min(...todays.map((c) => c.ms)) : undefined };
}

/** "0.12 s" */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
