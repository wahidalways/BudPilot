import { useState } from "react";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { GAME_EQ_NAME } from "@/utils/game";
import { MAX_MY_EQS, nameProblem } from "@/utils/my-eqs";

import type { BudPilot } from "./use-bud-pilot";

const flat = () => P.eqBands.map(() => 0);
/** What a preset does, as a curve (the device's `shape`: the earbuds play their own stored curve for presets). */
const presetShape = (mode: number) => P.eqPresets.find((p) => p.mode === mode)?.shape;

// names a saved EQ can't take: what the pill row already shows
const TAKEN = [...P.eqPresets.map((p) => p.name), "Custom", GAME_EQ_NAME];

/** Saving a new EQ (no `id`) or renaming the saved EQ `id`. */
export type Naming = { id?: string; name: string; problem?: string };

/** The EQ editor's logic, shared by the Windows settings page and the phone's EQ page: the curve shown (a drag's draft
 * while it lasts), committing a drag, and saving, renaming and deleting your own EQs. */
export function useEqEditor(b: BudPilot) {
  const state = b.state!;
  const my = b.myEqs;
  const [draft, setDraft] = useState<number[]>(); // what a drag shows while it lasts (sent when it ends)
  const [naming, setNaming] = useState<Naming>();
  const custom = P.customEqMode;
  const customOn = state.eqMode === custom;
  // a preset shows its own shape (the user: "it should show the preview"); dragging starts your own from it
  const shown = customOn ? state.eqGains : (presetShape(state.eqMode) ?? flat());
  const gains = draft ?? shown;
  const playing = my.playing;

  // a drag or an arrow key changes the saved EQ playing, if one is. It and the earbuds change in the same moment
  // (setEq shows its curve at once), so the curve stays put and the same pill stays chosen; waiting for the earbuds
  // here reset the next drag halfway (user, 2026-11-23)
  const commit = (next: number[]) => {
    if (playing) my.update(playing.id, next);
    setDraft(undefined);
    void b.setEq(custom, next);
  };

  /** Saves or renames; leaves `naming` open with its problem when the name won't do. */
  const confirmName = () => {
    if (!naming) return;
    if (!naming.id && my.list.length >= MAX_MY_EQS) return setNaming({ ...naming, problem: `You can keep ${MAX_MY_EQS}. Delete one first.` });
    const problem = nameProblem(naming.name, my.list, TAKEN, naming.id);
    if (problem) return setNaming({ ...naming, problem });
    if (naming.id) my.rename(naming.id, naming.name);
    else my.saveAs(naming.name, shown); // what the curve shows: the current sound, or the preset's shape to start from
    setNaming(undefined);
  };

  // "+ New": a name to start from ("My EQ 2"), selected so typing replaces it
  const startNew = () => {
    let n = my.list.length + 1;
    while (my.list.some((e) => e.name.toLowerCase() === `my eq ${n}`)) n++;
    setNaming({ name: `My EQ ${n}` });
  };

  /** What plays: the built-in Game EQ (it borrows the Custom slot), a preset, one of your saved EQs, or a Custom curve. */
  const kind: "game" | "preset" | "mine" | "custom" = b.game.builtIn ? "game" : !customOn && !draft ? "preset" : playing ? "mine" : "custom";

  return {
    gains,
    setDraft,
    commit,
    naming,
    setNaming,
    confirmName,
    startNew,
    kind,
    playing,
    faded: false,
    isFlat: gains.every((g) => g === 0),
    resetToFlat: () => commit(flat()),
  };
}
