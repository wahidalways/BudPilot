import { useEffect, useRef } from "react";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import type { EarbudsState } from "@/jieli/earbuds";
import { MIN_HOLD_MS, nearestIndex, pickStrength } from "@/utils/adaptive-anc";

import type { NoisePref } from "./use-earbuds";
import { useRoomLoudness } from "./use-room-loudness";

export const ANC_LEVELS = P.ancLevels.map((l) => l.level);

/** Adaptive noise cancelling, app-wide (not tied to a tab): while the noise setting being kept is noise cancelling on
 * Adaptive, follow the room's loudness, at most one strength change per MIN_HOLD_MS. */
export function useAdaptiveAnc(state: EarbudsState | undefined, target: NoisePref | undefined, onAutoLevel: (level: number) => void) {
  const on = state?.anc === 1 && target?.mode === 1 && !!target.adaptive;
  const room = useRoomLoudness(on);
  const current = nearestIndex(state?.ancLevel ?? 1, ANC_LEVELS);
  const lastChange = useRef(0);

  useEffect(() => {
    if (on) lastChange.current = 0; // may act on its first reading
  }, [on]);

  useEffect(() => {
    if (!on || room.db === undefined) return;
    const next = pickStrength(room.db, current);
    if (next === current || Date.now() - lastChange.current < MIN_HOLD_MS) return;
    lastChange.current = Date.now();
    onAutoLevel(ANC_LEVELS[next]);
  }, [on, room.db, current, onAutoLevel]);

  return { on, room, current };
}

export type AdaptiveStatus = ReturnType<typeof useAdaptiveAnc>;
