import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { Earbuds, EarbudsState } from "@/jieli/earbuds";
import { GAME_EQ_NAME, type GameEq, gameEqSteps, gameTarget, readGameEq, type SavedEq } from "@/utils/game";
import type { MyEq } from "@/utils/my-eqs";
import { loadPref, savePref } from "@/utils/prefs";

/** What Game mode does: lowest delay, and (if `eqOn`) a gaming EQ while it's on: `eq`, the built-in Game EQ unless
 * the user chose a preset or a saved EQ; their own EQ comes back after. Noise control is not part of it: the Sound
 * setting stays in charge. */
export type GamePrefs = { manual: boolean; auto: boolean; eqOn: boolean; eq?: GameEq };

const GAME_KEY = "budpilot.game";
const SAVED_EQ_KEY = "budpilot.gameSavedEq"; // kept on disk, so a crash mid-game can still put the user's EQ back
const DEFAULTS: GamePrefs = { manual: false, auto: true, eqOn: false };
const BUILTIN: GameEq = { kind: "builtin" };

type Deps = {
  state?: EarbudsState;
  connected: boolean;
  run: (fn: (e: Earbuds) => Promise<void>) => () => Promise<void>;
  setEq: (mode: number, gains: number[]) => Promise<void>;
  /** the user's saved EQs: one can be Game mode's EQ */
  myEqs: MyEq[];
};

/** True in the Windows app, which tells Shono when a full-screen game is running. */
export const canDetectGames = () => typeof navigator !== "undefined" && /Electron/.test(navigator.userAgent ?? "");

export function useGameMode({ state, connected, run, setEq, myEqs }: Deps) {
  const [prefs, setPrefs] = useState<GamePrefs>(() => {
    const saved = loadPref<Omit<Partial<GamePrefs>, "eq"> & { eq?: unknown }>(GAME_KEY);
    // older versions: `eq` was a Footsteps on/off switch, then (briefly) the choice alone, meaning on
    const eqOn = saved?.eqOn ?? (saved?.eq === true || (!!saved?.eq && typeof saved.eq === "object"));
    // only today's keys: older versions saved others (Game mode's own noise setting), which would ride along forever
    return { manual: saved?.manual ?? DEFAULTS.manual, auto: saved?.auto ?? DEFAULTS.auto, eqOn, eq: readGameEq(saved?.eq) };
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false); // switched off by hand during this game

  // the Windows shell reports full-screen games and videos (Windows' own "user notification state")
  useEffect(() => {
    (globalThis as { __budpilotFullscreen?: (on: boolean) => void }).__budpilotFullscreen = (on) => {
      setFullscreen(on);
      if (!on) setAutoPaused(false);
    };
  }, []);

  const byGame = prefs.auto && fullscreen && !autoPaused;
  const active = prefs.manual || byGame;

  const update = useCallback((p: Partial<GamePrefs>) => {
    setPrefs((old) => {
      const next = { ...old, ...p };
      savePref(GAME_KEY, next);
      return next;
    });
  }, []);

  /** The Game mode switch: on stays on; off also pauses the auto switch until this game ends. */
  const setOn = useCallback(
    (on: boolean) => {
      update({ manual: on });
      if (!on && byGame) setAutoPaused(true);
    },
    [update, byGame],
  );

  // low latency follows Game mode (the earbuds forget it when they power off)
  const lowLatency = state?.gameMode;
  useEffect(() => {
    if (connected && lowLatency !== undefined && lowLatency !== active) void run((e) => e.setGameMode(active))();
  }, [connected, lowLatency, active, run]);

  // Game mode's EQ while gaming; the user's own EQ goes back afterwards
  const presetGains = (s: EarbudsState, mode: number) => P.eqPresets.find((p) => p.mode === mode)?.gains ?? s.eqPresets.find((p) => p.mode === mode)?.gains;
  const flat = P.eqBands.map(() => 0);
  const choice = prefs.eq ?? BUILTIN;
  const target = active && prefs.eqOn && state ? gameTarget(choice, myEqs, P.customEqMode, (mode) => presetGains(state, mode) ?? flat) : undefined;
  const targetKey = target ? JSON.stringify(target) : ""; // re-applied when the choice (or a saved EQ's curve) changes
  const latest = useRef({ state, target });
  // layout effects: the EQ switch is on screen before the first paint after the change, so the Sound row never shows
  // the gaming EQ's curve as "Custom" for a moment (and a quick off-on reads the EQ just put back, not the Game EQ)
  useLayoutEffect(() => {
    latest.current = { state, target }; // read by the effect below without re-running it on every state change
  });
  useLayoutEffect(() => {
    const { state: s, target: wanted } = latest.current;
    if (!connected || !s) return;
    const custom = s.eqPresets.find((p) => p.mode === P.customEqMode)?.gains ?? s.eqGains;
    const { writes, saved } = gameEqSteps(wanted, loadPref<SavedEq>(SAVED_EQ_KEY), { mode: s.eqMode, custom }, P.customEqMode, (mode) =>
      presetGains(s, mode) ?? custom,
    );
    savePref(SAVED_EQ_KEY, saved ?? null);
    for (const [mode, gains] of writes) void setEq(mode, gains); // queued: they reach the earbuds in this order
  }, [targetKey, connected, setEq]);

  /** Which EQ the gaming EQ plays (Settings), and turning it on or off (the chip beside the Game mode switch). */
  const setGameEq = useCallback((eq: GameEq) => update({ eq }), [update]);
  const setEqOn = useCallback((eqOn: boolean) => update({ eqOn }), [update]);
  /** The user picked another EQ while the gaming EQ played: it turns off, and the put-back above plays their pick
   * instead of their old EQ (`custom`: a curve for the Custom slot too). */
  const leaveGameEq = useCallback(
    (mode: number, custom?: number[]) => {
      const saved = loadPref<SavedEq>(SAVED_EQ_KEY);
      if (saved) savePref(SAVED_EQ_KEY, { ...saved, mode, ...(custom && { custom }) });
      update({ eqOn: false });
    },
    [update],
  );
  const gameEqName =
    choice.kind === "builtin" ? GAME_EQ_NAME
    : choice.kind === "preset" ? (P.eqPresets.find((p) => p.mode === (choice as { mode: number }).mode)?.name ?? GAME_EQ_NAME)
    : (myEqs.find((e) => e.id === (choice as { id: string }).id)?.name ?? GAME_EQ_NAME);

  /** `eqPlaying`: the gaming EQ is playing now; `builtIn`: and it's the built-in Game EQ (no pill for it in the Sound
   * row, so the screen shows it as itself, not as Custom). `gameEqName`: what the chip shows. */
  return {
    prefs,
    update,
    active,
    byGame,
    fullscreen,
    setOn,
    choice,
    eqPlaying: !!target,
    builtIn: !!target && choice.kind === "builtin",
    gameEqName,
    setGameEq,
    setEqOn,
    leaveGameEq,
  };
}
