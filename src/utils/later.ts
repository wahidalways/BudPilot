// Timers for work that must also run while Shono is in the background. On Android they run on Android's own clock
// (the keeper module registers it at startup, app.native.tsx): React Native's timers stop in the background, and
// keeping them going (a headless task) woke Shono on every screen frame. Elsewhere (Windows, tests) they're ordinary.
type Later = (fn: () => void, ms: number) => () => void;
let native: Later | undefined;

export const setNativeTimers = (l: Later | undefined) => void (native = l);

/** Runs `fn` after `ms`; the returned function cancels it. */
export function later(fn: () => void, ms: number): () => void {
  if (native) return native(fn, ms);
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
}

export const sleep = (ms: number) => new Promise<void>((r) => void later(r, ms));
