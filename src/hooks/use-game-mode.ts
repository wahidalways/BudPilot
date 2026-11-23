import { useCallback, useEffect, useRef, useState } from "react";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { Earbuds, EarbudsState } from "@/jieli/earbuds";
import { gameEqSteps, type SavedEq } from "@/utils/game";
import { loadPref, savePref } from "@/utils/prefs";

/** What Game mode does: lowest delay, and (if `eq`) the Footsteps EQ while it's on. Noise control is not part of it:
 * the Sound setting stays in charge. */
export type GamePrefs = { manual: boolean; auto: boolean; eq: boolean };

const GAME_KEY = "budpilot.game";
const SAVED_EQ_KEY = "budpilot.gameSavedEq"; // kept on disk, so a crash mid-game can still put the user's EQ back
const DEFAULTS: GamePrefs = { manual: false, auto: true, eq: false };

type Deps = {
  state?: EarbudsState;
  connected: boolean;
  run: (fn: (e: Earbuds) => Promise<void>) => () => Promise<void>;
};

/** True in the Windows app, which tells BudPilot when a full-screen game is running. */
export const canDetectGames = () => typeof navigator !== "undefined" && /Electron/.test(navigator.userAgent ?? "");

export function useGameMode({ state, connected, run }: Deps) {
  const [prefs, setPrefs] = useState<GamePrefs>(() => ({ ...DEFAULTS, ...loadPref<Partial<GamePrefs>>(GAME_KEY) }));
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

  // game EQ in the Custom slot while gaming; the user's EQ goes back afterwards
  const eqWanted = active && prefs.eq;
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state; // read by the effect below without re-running it on every state change
  });
  useEffect(() => {
    const s = latest.current;
    if (!connected || !s) return;
    const custom = s.eqPresets.find((p) => p.mode === P.customEqMode)?.gains ?? s.eqGains;
    const { writes, saved } = gameEqSteps(
      eqWanted,
      loadPref<SavedEq>(SAVED_EQ_KEY),
      { mode: s.eqMode, custom },
      P.customEqMode,
      (mode) => P.eqPresets.find((p) => p.mode === mode)?.gains ?? s.eqPresets.find((p) => p.mode === mode)?.gains ?? custom,
    );
    savePref(SAVED_EQ_KEY, saved ?? null);
    if (writes.length) void run(async (e) => {
      for (const [mode, gains] of writes) await e.setEq(mode, gains);
    })();
  }, [eqWanted, connected, run]);

  /** Footsteps EQ off for an EQ the user picked while it played: the put-back above plays that one, not the old one. */
  const leaveFootsteps = useCallback(
    (mode: number) => {
      const saved = loadPref<SavedEq>(SAVED_EQ_KEY);
      if (saved) savePref(SAVED_EQ_KEY, { ...saved, mode });
      update({ eq: false });
    },
    [update],
  );

  /** `footsteps`: the Footsteps EQ is playing now (it uses the Custom slot, so the EQ shows "Footsteps", not Custom). */
  return { prefs, update, active, byGame, fullscreen, setOn, footsteps: eqWanted, leaveFootsteps };
}
