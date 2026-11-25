// What the phone and the Windows app share from the home screens, with no screens in it: the phone's bundle used to
// take the Windows tray's components along with these (parts.tsx, touch-controls.tsx re-export them for Windows).
import { useEffect, useState } from "react";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { ANC_LEVELS } from "@/hooks/use-adaptive-anc";
import type { NoisePref } from "@/hooks/use-earbuds";
import { GAME_EQ_NAME } from "@/utils/game";
import { nearestIndex } from "@/utils/adaptive-anc";
import { type Correction, seconds } from "@/utils/corrections";

import { type BudPilot, modeName } from "./use-bud-pilot";

const levelName = (level: number) => P.ancLevels[nearestIndex(level, ANC_LEVELS)]?.name ?? "";

/** What Shono is holding, in a few words: "Off", "ANC Mid", "ANC Adaptive". */
export const keepText = (p: NoisePref) => (p.mode === 1 ? `ANC ${p.adaptive ? "Adaptive" : levelName(p.ncLevel)}` : modeName(p.mode));

/** The put-back that just happened (for a couple of seconds), so the views can show it. */
export function useJustCorrected(corrections: Correction[]) {
  const [since] = useState(() => Date.now()); // only put-backs from now on
  const [expired, setExpired] = useState<number>(); // the last one whose moment has passed
  const latest = corrections[0];
  useEffect(() => {
    if (!latest || latest.at < since) return;
    const t = setTimeout(() => setExpired(latest.at), 2200);
    return () => clearTimeout(t);
  }, [latest, since]);
  return latest && latest.at >= since && expired !== latest.at ? latest : undefined;
}

/** The keep chip's words, [lead, strong, tail]: "Keeping Off", "Putting ANC back", or "Undid ANC 0.12 s" right after a
 * put-back (`loud`). Undefined when Shono isn't keeping a setting. */
export function keepChipParts(b: BudPilot, just?: Correction) {
  if (!b.keep || !b.noisePref) return undefined;
  const putting = b.putting;
  const text: [string, string, string] = putting
    ? ["Putting ", modeName(putting.to), " back"]
    : just
      ? [`Undid ${modeName(just.from)} `, seconds(just.ms), ""]
      : ["Keeping ", keepText(b.noisePref), ""];
  return { text, loud: !!just && !putting };
}

export const MODE_SUBS = ["Normal listening", "Blocks the room", "Hear the room"];
export const STRENGTHS = [...P.ancLevels.map((l, i) => ({ value: String(i), label: l.name })), { value: "adaptive", label: "Adaptive" }];

/** One pill in a row of choices. */
export type Choice = { key: string; label: string; on: boolean; onPress: () => void };

/** Hoco's EQ presets, the user's saved EQs, then Custom: only while nothing is saved, or while the earbuds play a curve
 * that isn't saved (so the chosen pill always matches what plays). The gaming EQ isn't a pill (its chip sits beside
 * the Game mode switch); picking an EQ here while it plays turns it off and plays the pick. */
export function eqChoices(b: BudPilot): Choice[] {
  const state = b.state!;
  const g = b.game;
  const my = b.myEqs;
  const custom = P.customEqMode;
  const flat = () => P.eqBands.map(() => 0);
  const stored = (mode: number) => state.eqPresets.find((p) => p.mode === mode)?.gains;
  // `curve`: for the Custom slot (saved EQs, Custom)
  const play = (mode: number, gains: number[], curve?: number[]) => (g.eqPlaying ? g.leaveGameEq(mode, curve) : void b.setEq(mode, gains));
  const unsaved = state.eqMode === custom && !my.playing && !g.builtIn; // a Custom curve that isn't a saved EQ
  return [
    ...P.eqPresets.map((p) => ({
      key: `eq-${p.mode}`,
      label: p.name,
      on: !g.builtIn && state.eqMode === p.mode,
      onPress: () => play(p.mode, p.gains ?? stored(p.mode) ?? flat()),
    })),
    ...my.list.map((e) => ({
      key: `eq-my-${e.id}`,
      label: e.name,
      on: my.playing?.id === e.id,
      onPress: () => (g.eqPlaying ? (my.pick(e.id), g.leaveGameEq(custom, e.gains)) : my.play(e)),
    })),
    // "Custom" only while a curve that isn't saved plays (the user: no custom made by Shono; you make your own)
    ...(unsaved ? [{ key: `eq-${custom}`, label: "Custom", on: true, onPress: () => (g.eqPlaying ? g.leaveGameEq(custom, my.customCurve()) : my.playCustom()) }] : []),
  ];
}

/** Which EQ the gaming EQ plays: the built-in Game EQ, a preset or a saved EQ. */
export function gameEqChoices(b: BudPilot): Choice[] {
  const { choice, setGameEq } = b.game;
  return [
    { key: "game-eq-builtin", label: GAME_EQ_NAME, on: choice.kind === "builtin", onPress: () => setGameEq({ kind: "builtin" }) },
    ...P.eqPresets.map((p) => ({
      key: `game-eq-${p.mode}`,
      label: p.name,
      on: choice.kind === "preset" && choice.mode === p.mode,
      onPress: () => setGameEq({ kind: "preset", mode: p.mode }),
    })),
    ...b.myEqs.list.map((e) => ({
      key: `game-eq-my-${e.id}`,
      label: e.name,
      on: choice.kind === "mine" && choice.id === e.id,
      onPress: () => setGameEq({ kind: "mine", id: e.id }),
    })),
  ];
}

export const CREDIT_NAME = "wahidalways";

export const gesture = (taps: number) => ["Tap", "Double tap", "Triple tap"][taps - 1] ?? `${taps} taps`;
export const fnName = (fn: number) => P.keyFunctions.find((f) => f.fn === fn)?.name ?? `Other (${fn})`;
