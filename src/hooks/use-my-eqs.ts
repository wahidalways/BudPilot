import { useCallback, useEffect, useState } from "react";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { EarbudsState } from "@/jieli/earbuds";
import { GAME_EQ } from "@/utils/game";
import { type MyEq, playingEq, sameCurve } from "@/utils/my-eqs";
import { loadPref, savePref } from "@/utils/prefs";

const KEY = "budpilot.myEqs";
const FREE_KEY = "budpilot.freeCustom"; // the Custom curve that isn't a saved one: what the Custom pill plays
const PICKED_KEY = "budpilot.myEqPicked"; // the saved EQ picked or made last: it wins when two hold the same curve

const flat = () => P.eqBands.map(() => 0);

type Deps = {
  state?: EarbudsState;
  setEq: (mode: number, gains: number[]) => Promise<void>;
};

/** The user's saved EQs, which one is playing, and playing, saving, renaming and deleting them. Shono never picks
 * an EQ by itself: the earbuds keep whatever is set on them. */
export function useMyEqs({ state, setEq }: Deps) {
  const [list, setList] = useState<MyEq[]>(() => loadPref<MyEq[]>(KEY) ?? []);
  const [picked, setPickedState] = useState(() => loadPref<string>(PICKED_KEY));
  const keep = useCallback((next: MyEq[]) => {
    setList(next);
    savePref(KEY, next);
  }, []);
  const pick = useCallback((id: string) => {
    setPickedState(id);
    savePref(PICKED_KEY, id);
  }, []);
  const customOn = state?.eqMode === P.customEqMode;
  const playing = state ? playingEq(list, customOn, state.eqGains, picked) : undefined;

  // remember the unsaved Custom curve, so the Custom pill can bring it back after a saved EQ played
  const gains = state?.eqGains;
  useEffect(() => {
    if (gains && customOn && !playing && !sameCurve(gains, GAME_EQ)) savePref(FREE_KEY, gains); // not the built-in Game EQ
  }, [gains, customOn, playing]);

  /** Plays a curve through the Custom slot. */
  const playCurve = useCallback((curve: number[]) => void setEq(P.customEqMode, curve), [setEq]);

  return {
    list,
    playing,
    /** Marks a saved EQ as the one playing (before its curve is sent some other way, e.g. leaving the gaming EQ). */
    pick,
    play: (eq: MyEq) => {
      pick(eq.id);
      playCurve(eq.gains);
    },
    /** The Custom pill: the user's unsaved curve (flat if there never was one). */
    customCurve: () => loadPref<number[]>(FREE_KEY) ?? flat(),
    playCustom: () => playCurve(loadPref<number[]>(FREE_KEY) ?? flat()),
    /** A new saved EQ from `curve`, played straight away (selected, ready to shape). */
    saveAs: (name: string, curve: number[]) => {
      const id = Date.now().toString(36);
      keep([...list, { id, name: name.trim(), gains: curve }]);
      pick(id);
      if (!customOn || !gains || !sameCurve(gains, curve)) playCurve(curve);
    },
    update: (id: string, curve: number[]) => keep(list.map((e) => (e.id === id ? { ...e, gains: curve } : e))),
    rename: (id: string, name: string) => keep(list.map((e) => (e.id === id ? { ...e, name: name.trim() } : e))),
    remove: (id: string) => keep(list.filter((e) => e.id !== id)),
  };
}
